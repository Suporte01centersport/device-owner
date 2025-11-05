using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Collections.Generic;
using Microsoft.Extensions.Options;
using UEMAgent.Data;
using UEMAgent.Models;

namespace UEMAgent.Services;

public class WebSocketService : IDisposable
{
    private readonly AppSettings _settings;
    private ClientWebSocket? _webSocket;
    private CancellationTokenSource? _cancellationTokenSource;
    private bool _isConnected = false;
    private int _reconnectAttempts = 0;

    public event EventHandler<ComputerInfo>? OnStatusUpdateRequested;
    public event EventHandler<RemoteAction>? OnRemoteActionReceived;

    public WebSocketService(IOptions<AppSettings> settings)
    {
        _settings = settings.Value;
    }

    public bool IsConnected => _isConnected && _webSocket?.State == WebSocketState.Open;

    public async Task ConnectAsync()
    {
        if (IsConnected)
            return;

        _cancellationTokenSource = new CancellationTokenSource();
        
        while (!_cancellationTokenSource.Token.IsCancellationRequested && 
               _reconnectAttempts < _settings.MaxReconnectAttempts)
        {
            try
            {
                _webSocket?.Dispose();
                _webSocket = new ClientWebSocket();
                
                var uri = new Uri(_settings.ServerUrl);
                await _webSocket.ConnectAsync(uri, _cancellationTokenSource.Token);
                
                _isConnected = true;
                _reconnectAttempts = 0;
                
                Console.WriteLine($"✅ Conectado ao servidor: {_settings.ServerUrl}");
                
                // Iniciar recepção de mensagens
                _ = Task.Run(() => ReceiveMessagesAsync(_cancellationTokenSource.Token));
                
                return;
            }
            catch (Exception ex)
            {
                _reconnectAttempts++;
                Console.WriteLine($"❌ Erro ao conectar (tentativa {_reconnectAttempts}): {ex.Message}");
                
                if (_reconnectAttempts < _settings.MaxReconnectAttempts)
                {
                    await Task.Delay(_settings.ReconnectDelay, _cancellationTokenSource.Token);
                }
            }
        }
    }

    public async Task SendComputerStatusAsync(ComputerInfo computerInfo)
    {
        if (!IsConnected)
            return;

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
            Console.WriteLine($"📤 Enviando status do computador: {computerInfo.Name} ({computerInfo.ComputerId})");
            
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
            Console.WriteLine($"❌ Erro ao enviar status: {ex.Message}");
            _isConnected = false;
        }
    }

    private async Task ReceiveMessagesAsync(CancellationToken cancellationToken)
    {
        var buffer = new byte[4096];
        
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
                    await _webSocket.CloseAsync(
                        WebSocketCloseStatus.NormalClosure,
                        "Closing",
                        cancellationToken
                    );
                    _isConnected = false;
                    break;
                }

                var message = Encoding.UTF8.GetString(buffer, 0, result.Count);
                if (!string.IsNullOrEmpty(message))
                {
                    ProcessMessage(message);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"❌ Erro ao receber mensagem: {ex.Message}");
                _isConnected = false;
                
                // Tentar reconectar
                if (!cancellationToken.IsCancellationRequested)
                {
                    await Task.Delay(_settings.ReconnectDelay, cancellationToken);
                    _ = Task.Run(() => ConnectAsync());
                }
                break;
            }
        }
    }

    private void ProcessMessage(string message)
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
                    var remoteAction = new RemoteAction
                    {
                        Action = action ?? "",
                        Params = paramsElement.ValueKind == JsonValueKind.Object ? 
                                JsonSerializer.Deserialize<Dictionary<string, object>>(paramsElement.GetRawText()) ?? 
                                new Dictionary<string, object>() : 
                                new Dictionary<string, object>()
                    };
                    OnRemoteActionReceived?.Invoke(this, remoteAction);
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
        _cancellationTokenSource?.Cancel();
        _webSocket?.Dispose();
        _cancellationTokenSource?.Dispose();
    }
}

public class RemoteAction
{
    public string Action { get; set; } = string.Empty;
    public Dictionary<string, object> Params { get; set; } = new();
}


