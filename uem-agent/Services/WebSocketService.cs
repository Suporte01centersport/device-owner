using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Collections.Generic;
using Microsoft.Extensions.Options;
using UEMAgent.Data;
using UEMAgent.Models;
using System;
using System.Threading;

namespace UEMAgent.Services;

public class WebSocketService : IDisposable
{
    private readonly AppSettings _settings;
    private ClientWebSocket? _webSocket;
    private CancellationTokenSource? _cancellationTokenSource;
    private bool _isConnected = false;
    private int _reconnectAttempts = 0;
    private readonly RemoteAccessService? _remoteAccessService;
    private readonly SemaphoreSlim _connectSemaphore = new SemaphoreSlim(1, 1);
    private Task? _receiveTask;
    private Task? _heartbeatTask;
    private DateTime _lastMessageReceived = DateTime.UtcNow;
    private bool _isReconnecting = false;
    private Task? _connectionMonitorTask;
    private CancellationTokenSource? _connectionMonitorCts;

    public event EventHandler<ComputerInfo>? OnStatusUpdateRequested;
    public event EventHandler<RemoteAction>? OnRemoteActionReceived;
    public event EventHandler<Models.RemoteInputEvent>? OnRemoteInputReceived;
    public event EventHandler<string>? OnRemoteSessionRequested;
    public event EventHandler? OnRemoteSessionStopped;

    public WebSocketService(IOptions<AppSettings> settings, RemoteAccessService? remoteAccessService = null)
    {
        _settings = settings.Value;
        _remoteAccessService = remoteAccessService;
    }

    public bool IsConnected => _isConnected && _webSocket?.State == WebSocketState.Open;

    public void StartPersistentConnection()
    {
        if (_connectionMonitorTask != null && !_connectionMonitorTask.IsCompleted)
        {
            return;
        }

        _connectionMonitorCts?.Cancel();
        _connectionMonitorCts?.Dispose();
        _connectionMonitorCts = new CancellationTokenSource();

        _connectionMonitorTask = Task.Run(() => MonitorConnectionAsync(_connectionMonitorCts.Token));
    }

    public void StopPersistentConnection()
    {
        _connectionMonitorCts?.Cancel();
        _connectionMonitorCts?.Dispose();
        _connectionMonitorCts = null;
        _connectionMonitorTask = null;
    }

    public async Task ConnectAsync()
    {
        // Evitar múltiplas tentativas simultâneas
        if (!await _connectSemaphore.WaitAsync(0))
        {
            return; // Já está tentando conectar
        }

        try
        {
            if (IsConnected)
            {
                return;
            }

            _isReconnecting = true;
            _cancellationTokenSource?.Cancel();
            _cancellationTokenSource?.Dispose();
            _cancellationTokenSource = new CancellationTokenSource();
            
            // Limpar conexão anterior
            try
            {
                if (_webSocket != null)
                {
                    if (_webSocket.State == WebSocketState.Open || _webSocket.State == WebSocketState.Connecting)
                    {
                        await _webSocket.CloseAsync(WebSocketCloseStatus.NormalClosure, "Reconnecting", CancellationToken.None);
                    }
                    _webSocket.Dispose();
                }
            }
            catch { }

            _webSocket = new ClientWebSocket();
            
            // Configurar timeout de conexão
            using var timeoutCts = new CancellationTokenSource(TimeSpan.FromSeconds(10));
            using var linkedCts = CancellationTokenSource.CreateLinkedTokenSource(_cancellationTokenSource.Token, timeoutCts.Token);
            
            try
            {
                var uri = new Uri(_settings.ServerUrl);
                Console.WriteLine($"🔄 Tentando conectar ao servidor: {_settings.ServerUrl}...");
                
                await _webSocket.ConnectAsync(uri, linkedCts.Token);
                
                _isConnected = true;
                _reconnectAttempts = 0;
                _lastMessageReceived = DateTime.UtcNow;
                
                Console.WriteLine($"✅ Conectado ao servidor: {_settings.ServerUrl}");
                
                // Iniciar recepção de mensagens
                _receiveTask = Task.Run(() => ReceiveMessagesAsync(_cancellationTokenSource.Token));
                
                // Iniciar heartbeat para detectar conexões mortas
                _heartbeatTask = Task.Run(() => HeartbeatAsync(_cancellationTokenSource.Token));
            }
            catch (OperationCanceledException) when (timeoutCts.Token.IsCancellationRequested)
            {
                throw new TimeoutException("Timeout ao conectar ao servidor");
            }
        }
        catch (Exception ex)
        {
            _isConnected = false;
            _reconnectAttempts++;
            
            // Calcular delay exponencial (máximo 60 segundos)
            var delay = Math.Min(_settings.ReconnectDelay * (int)Math.Pow(2, Math.Min(_reconnectAttempts - 1, 4)), 60000);
            
            Console.WriteLine($"❌ Erro ao conectar (tentativa {_reconnectAttempts}): {ex.Message}");
            Console.WriteLine($"⏳ Tentando novamente em {delay / 1000} segundos...");
            
            // Continuar tentando reconectar indefinidamente (não parar após MaxReconnectAttempts)
            if (!_cancellationTokenSource?.Token.IsCancellationRequested ?? true)
            {
                await Task.Delay(delay, _cancellationTokenSource?.Token ?? CancellationToken.None);
                _ = Task.Run(() => ConnectAsync()); // Tentar novamente em background
            }
        }
        finally
        {
            _isReconnecting = false;
            _connectSemaphore.Release();
        }
    }

    public async Task WaitForConnectionAsync(TimeSpan timeout, CancellationToken cancellationToken)
    {
        var start = DateTime.UtcNow;

        while (!cancellationToken.IsCancellationRequested)
        {
            if (IsConnected)
            {
                return;
            }

            if (timeout != Timeout.InfiniteTimeSpan && DateTime.UtcNow - start > timeout)
            {
                throw new TimeoutException("Não foi possível estabelecer conexão com o servidor UEM no tempo limite informado.");
            }

            await Task.Delay(1000, cancellationToken);
        }

        cancellationToken.ThrowIfCancellationRequested();
    }

    public async Task SendDesktopFrameAsync(byte[] frameData, string sessionId)
    {
        if (!IsConnected)
        {
            // Não tentar reconectar para frames (evitar spam)
            return;
        }

        try
        {
            var message = new Dictionary<string, object>
            {
                { "type", "desktop_frame" },
                { "sessionId", sessionId },
                { "frame", Convert.ToBase64String(frameData) },
                { "timestamp", DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() }
            };

            var options = new JsonSerializerOptions
            {
                PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
                WriteIndented = false
            };
            var json = JsonSerializer.Serialize(message, options);
            var buffer = Encoding.UTF8.GetBytes(json);
            
            await _webSocket!.SendAsync(
                new ArraySegment<byte>(buffer),
                WebSocketMessageType.Text,
                true,
                CancellationToken.None
            );
        }
        catch (WebSocketException)
        {
            // Erro de WebSocket - marcar como desconectado
            _isConnected = false;
            if (!_isReconnecting)
            {
                _ = Task.Run(() => ConnectAsync());
            }
        }
        catch (Exception)
        {
            // Outros erros - silenciosamente ignorar para frames
        }
    }

    public async Task SendComputerStatusAsync(ComputerInfo computerInfo)
    {
        if (!IsConnected)
        {
            // Tentar reconectar se não estiver conectado
            if (!_isReconnecting)
            {
                _ = Task.Run(() => ConnectAsync());
            }
            return;
        }

        try
        {
            // Usar camelCase para compatibilidade com JavaScript
            var options = new JsonSerializerOptions
            {
                PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
                WriteIndented = false,
                DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull
            };
            
            // Serializar o ComputerInfo primeiro para garantir que as propriedades sejam convertidas
            var computerInfoJson = JsonSerializer.Serialize(computerInfo, options);
            var computerInfoDict = JsonSerializer.Deserialize<Dictionary<string, object>>(computerInfoJson);
            
            var message = new Dictionary<string, object>
            {
                { "type", "computer_status" },
                { "data", computerInfoDict ?? new Dictionary<string, object>() }
            };
            
            var json = JsonSerializer.Serialize(message, options);
            
            var buffer = Encoding.UTF8.GetBytes(json);
            
            await _webSocket!.SendAsync(
                new ArraySegment<byte>(buffer),
                WebSocketMessageType.Text,
                true,
                CancellationToken.None
            );
        }
        catch (WebSocketException wsEx)
        {
            Console.WriteLine($"❌ Erro WebSocket ao enviar status: {wsEx.Message}");
            _isConnected = false;
            
            // Tentar reconectar
            if (!_isReconnecting)
            {
                _ = Task.Run(() => ConnectAsync());
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"❌ Erro ao enviar status: {ex.Message}");
            _isConnected = false;
            
            // Tentar reconectar
            if (!_isReconnecting)
            {
                _ = Task.Run(() => ConnectAsync());
            }
        }
    }

    private async Task ReceiveMessagesAsync(CancellationToken cancellationToken)
    {
        var buffer = new byte[8192]; // Buffer maior para mensagens grandes
        
        while (!cancellationToken.IsCancellationRequested && IsConnected)
        {
            try
            {
                var result = await _webSocket!.ReceiveAsync(
                    new ArraySegment<byte>(buffer),
                    cancellationToken
                );

                if (result.MessageType == WebSocketMessageType.Close)
                {
                    Console.WriteLine("⚠️ Servidor fechou a conexão");
                    _isConnected = false;
                    
                    // Tentar reconectar
                    if (!cancellationToken.IsCancellationRequested)
                    {
                        _ = Task.Run(() => ConnectAsync());
                    }
                    break;
                }

                _lastMessageReceived = DateTime.UtcNow; // Atualizar timestamp da última mensagem
                
                var message = Encoding.UTF8.GetString(buffer, 0, result.Count);
                if (!string.IsNullOrEmpty(message))
                {
                    // Log geral - verificar se QUALQUER mensagem está chegando
                    Console.WriteLine($"📥 Mensagem recebida no agente (tamanho: {message.Length} bytes)");
                    
                    // Log para debug - verificar se mensagens estão chegando
                    try
                    {
                        using var doc = JsonDocument.Parse(message);
                        var root = doc.RootElement;
                        
                        // Log do tipo da mensagem
                        if (root.TryGetProperty("type", out var typeProp))
                        {
                            var msgType = typeProp.GetString();
                            Console.WriteLine($"   Tipo da mensagem: {msgType}");
                            
                            if (msgType == "uem_remote_action")
                            {
                                if (root.TryGetProperty("action", out var actionProp))
                                {
                                    var action = actionProp.GetString();
                                    Console.WriteLine($"📨 Mensagem uem_remote_action recebida no agente - Action: {action}");
                                    if (root.TryGetProperty("params", out var paramsProp))
                                    {
                                        Console.WriteLine($"   Params: {paramsProp.GetRawText()}");
                                    }
                                }
                            }
                        }
                        else
                        {
                            Console.WriteLine($"   ⚠️ Mensagem sem campo 'type': {message.Substring(0, Math.Min(200, message.Length))}");
                        }
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"❌ Erro ao parsear mensagem para log: {ex.Message}");
                        Console.WriteLine($"   Mensagem recebida (primeiros 200 chars): {message.Substring(0, Math.Min(200, message.Length))}");
                    }
                    
                    _ = Task.Run(async () => await ProcessMessageAsync(message));
                }
            }
            catch (WebSocketException wsEx)
            {
                Console.WriteLine($"❌ Erro WebSocket: {wsEx.Message}");
                _isConnected = false;
                
                // Tentar reconectar
                if (!cancellationToken.IsCancellationRequested)
                {
                    await Task.Delay(1000, cancellationToken); // Pequeno delay antes de reconectar
                    _ = Task.Run(() => ConnectAsync());
                }
                break;
            }
            catch (OperationCanceledException)
            {
                // Cancelamento normal, não é erro
                break;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"❌ Erro ao receber mensagem: {ex.Message}");
                _isConnected = false;
                
                // Tentar reconectar
                if (!cancellationToken.IsCancellationRequested)
                {
                    await Task.Delay(1000, cancellationToken);
                    _ = Task.Run(() => ConnectAsync());
                }
                break;
            }
        }
    }

    private async Task HeartbeatAsync(CancellationToken cancellationToken)
    {
        while (!cancellationToken.IsCancellationRequested && IsConnected)
        {
            try
            {
                await Task.Delay(TimeSpan.FromSeconds(30), cancellationToken); // Verificar a cada 30 segundos
                
                // Verificar se recebemos alguma mensagem recentemente (últimos 60 segundos)
                var timeSinceLastMessage = DateTime.UtcNow - _lastMessageReceived;
                if (timeSinceLastMessage.TotalSeconds > 60 && IsConnected)
                {
                    Console.WriteLine("⚠️ Nenhuma mensagem recebida há mais de 60 segundos. Reconectando...");
                    _isConnected = false;
                    
                    if (!cancellationToken.IsCancellationRequested)
                    {
                        _ = Task.Run(() => ConnectAsync());
                    }
                    break;
                }
                
                // Verificar se a conexão ainda está aberta
                if (_webSocket?.State != WebSocketState.Open)
                {
                    Console.WriteLine($"⚠️ Estado da conexão: {_webSocket?.State}. Reconectando...");
                    _isConnected = false;
                    
                    if (!cancellationToken.IsCancellationRequested)
                    {
                        _ = Task.Run(() => ConnectAsync());
                    }
                    break;
                }
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"❌ Erro no heartbeat: {ex.Message}");
                // Continuar tentando
            }
        }
    }

    private async Task MonitorConnectionAsync(CancellationToken cancellationToken)
    {
        while (!cancellationToken.IsCancellationRequested)
        {
            try
            {
                if (!IsConnected && !_isReconnecting)
                {
                    await ConnectAsync();
                }
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"❌ Erro no monitor de conexão: {ex.Message}");
            }

            try
            {
                await Task.Delay(TimeSpan.FromSeconds(5), cancellationToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }

    private async Task SendRemoteAccessInfoAsync(string computerId)
    {
        if (!IsConnected) return;

        try
        {
            var remoteAccessService = _remoteAccessService ?? new RemoteAccessService();
            var anydeskInstalled = remoteAccessService.IsAnyDeskInstalled();
            var anydeskId = anydeskInstalled ? remoteAccessService.GetAnyDeskId() : null;

            var response = new
            {
                type = "remote_access_info_response",
                computerId = computerId,
                info = new
                {
                    anydeskInstalled = anydeskInstalled,
                    anydeskId = anydeskId,
                    rdpEnabled = false // Seria necessário verificar via registro
                },
                timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
            };

            var options = new JsonSerializerOptions
            {
                PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
                WriteIndented = false
            };
            var json = JsonSerializer.Serialize(response, options);
            var buffer = Encoding.UTF8.GetBytes(json);

            await _webSocket!.SendAsync(
                new ArraySegment<byte>(buffer),
                WebSocketMessageType.Text,
                true,
                CancellationToken.None
            );
        }
        catch (Exception ex)
        {
            Console.WriteLine($"❌ Erro ao enviar informações de acesso remoto: {ex.Message}");
        }
    }

    private async Task ProcessMessageAsync(string message)
    {
        try
        {
            using var doc = JsonDocument.Parse(message);
            var root = doc.RootElement;
            var type = root.GetProperty("type").GetString();

            switch (type)
            {
                case "request_computer_status":
                    OnStatusUpdateRequested?.Invoke(this, new ComputerInfo());
                    break;
                    
                       case "uem_remote_action":
                           var action = root.GetProperty("action").GetString();
                           var paramsElement = root.TryGetProperty("params", out var p) ? p : default;
                           Console.WriteLine($"📥 Processando uem_remote_action - Action: {action}");
                           var remoteAction = new RemoteAction
                           {
                               Action = action ?? "",
                               Params = paramsElement.ValueKind == JsonValueKind.Object ? 
                                       JsonSerializer.Deserialize<Dictionary<string, object>>(paramsElement.GetRawText()) ?? 
                                       new Dictionary<string, object>() : 
                                       new Dictionary<string, object>()
                           };
                           Console.WriteLine($"📦 Params recebidos: {JsonSerializer.Serialize(remoteAction.Params)}");
                           Console.WriteLine($"📤 Disparando evento OnRemoteActionReceived...");
                           OnRemoteActionReceived?.Invoke(this, remoteAction);
                           Console.WriteLine($"✅ Evento OnRemoteActionReceived disparado");
                           break;
                    
                case "get_remote_access_info":
                    // Responder com informações de acesso remoto
                    var computerId = root.TryGetProperty("computerId", out var cid) ? cid.GetString() : null;
                    await SendRemoteAccessInfoAsync(computerId ?? "");
                    break;
                    
                case "remote_input":
                    // Receber eventos de input remoto (mouse, teclado)
                    var inputEvent = JsonSerializer.Deserialize<Models.RemoteInputEvent>(message);
                    if (inputEvent != null)
                    {
                        OnRemoteInputReceived?.Invoke(this, inputEvent);
                    }
                    break;
                    
                case "start_remote_session":
                    // Iniciar sessão de acesso remoto
                    var sessionComputerId = root.TryGetProperty("computerId", out var sid) ? sid.GetString() : null;
                    OnRemoteSessionRequested?.Invoke(this, sessionComputerId ?? "");
                    break;
                    
                case "stop_remote_session":
                    // Parar sessão de acesso remoto
                    OnRemoteSessionStopped?.Invoke(this, EventArgs.Empty);
                    break;
                    
                default:
                    Console.WriteLine($"⚠️ Tipo de mensagem desconhecido: {type}");
                    break;
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"❌ Erro ao processar mensagem: {ex.Message}");
        }
    }

    public void Dispose()
    {
        StopPersistentConnection();
        _cancellationTokenSource?.Cancel();
        
        try
        {
            _receiveTask?.Wait(TimeSpan.FromSeconds(2));
            _heartbeatTask?.Wait(TimeSpan.FromSeconds(2));
        }
        catch { }
        
        try
        {
            if (_webSocket?.State == WebSocketState.Open)
            {
                _webSocket.CloseAsync(WebSocketCloseStatus.NormalClosure, "Disposing", CancellationToken.None).Wait(TimeSpan.FromSeconds(2));
            }
        }
        catch { }
        
        _webSocket?.Dispose();
        _cancellationTokenSource?.Dispose();
        _connectSemaphore?.Dispose();
    }
}

public class RemoteAction
{
    public string Action { get; set; } = string.Empty;
    public Dictionary<string, object> Params { get; set; } = new();
}


