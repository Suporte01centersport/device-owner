using System.Diagnostics;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using UEMAgent.Data;
using UEMAgent.Models;

namespace UEMAgent.Services;

public class AgentService : BackgroundService
{
    private readonly AppSettings _settings;
    private readonly SystemInfoService _systemInfoService;
    private readonly WebSocketService _webSocketService;
    private readonly LocationService _locationService;
    private readonly RemoteAccessService _remoteAccessService;
    private readonly RemoteDesktopService _remoteDesktopService;

    public AgentService(
        IOptions<AppSettings> settings,
        SystemInfoService systemInfoService,
        WebSocketService webSocketService,
        LocationService locationService,
        RemoteAccessService remoteAccessService,
        RemoteDesktopService remoteDesktopService)
    {
        _settings = settings.Value;
        _systemInfoService = systemInfoService;
        _webSocketService = webSocketService;
        _locationService = locationService;
        _remoteAccessService = remoteAccessService;
        _remoteDesktopService = remoteDesktopService;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Configurar eventos
        _webSocketService.OnStatusUpdateRequested += OnStatusUpdateRequested;
        _webSocketService.OnRemoteActionReceived += OnRemoteActionReceived;
        
        // Configurar eventos de desktop remoto
        _remoteDesktopService.FrameCaptured += OnDesktopFrameCaptured;
        _remoteDesktopService.SessionStarted += OnDesktopSessionStarted;
        _remoteDesktopService.SessionStopped += OnDesktopSessionStopped;

        // Conectar ao servidor
        await _webSocketService.ConnectAsync();

        // Enviar status inicial
        await SendComputerStatusAsync();

        // Enviar localização inicial
        await SendLocationAsync();

        // Loop principal
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                // Reconectar se necessário (tentativa contínua em background)
                if (!_webSocketService.IsConnected)
                {
                    Console.WriteLine("⚠️ Não conectado ao servidor. Tentando reconectar...");
                    _ = Task.Run(() => _webSocketService.ConnectAsync());
                    
                    // Aguardar um pouco antes de tentar enviar dados
                    await Task.Delay(2000, stoppingToken);
                    continue;
                }

                // Enviar status periodicamente
                await SendComputerStatusAsync();

                // Enviar localização periodicamente
                await SendLocationAsync();

                // Aguardar intervalo
                await Task.Delay(_settings.UpdateInterval, stoppingToken);
            }
            catch (OperationCanceledException)
            {
                // Cancelamento normal, sair do loop
                break;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"❌ Erro no loop principal: {ex.Message}");
                await Task.Delay(5000, stoppingToken);
            }
        }
    }

    private async Task SendComputerStatusAsync()
    {
        try
        {
            var computerInfo = await _systemInfoService.GetComputerInfoAsync();
            await _webSocketService.SendComputerStatusAsync(computerInfo);
            Console.WriteLine($"✅ Status enviado: {computerInfo.Name} (IP: {computerInfo.IpAddress})");
        }
        catch (Exception ex)
        {
            Console.WriteLine($"❌ Erro ao enviar status: {ex.Message}");
        }
    }

    private async Task SendLocationAsync()
    {
        try
        {
            var location = await _locationService.GetLocationAsync();
            if (location != null && location.Latitude.HasValue && location.Longitude.HasValue)
            {
                // Enviar localização junto com o status
                var computerInfo = await _systemInfoService.GetComputerInfoAsync();
                computerInfo.Latitude = location.Latitude;
                computerInfo.Longitude = location.Longitude;
                computerInfo.LocationAccuracy = location.Accuracy;
                computerInfo.LocationAddress = location.Address;
                computerInfo.LocationSource = location.Source;
                await _webSocketService.SendComputerStatusAsync(computerInfo);
                
                Console.WriteLine($"📍 Localização enviada: {location.Address ?? "Desconhecido"} " +
                                $"(Lat: {location.Latitude:F6}, Lon: {location.Longitude:F6}, " +
                                $"Precisão: {location.Accuracy / 1000:F1}km, Fonte: {location.Source ?? "IP"})");
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"❌ Erro ao enviar localização: {ex.Message}");
        }
    }

    private void OnStatusUpdateRequested(object? sender, ComputerInfo e)
    {
        _ = Task.Run(async () => await SendComputerStatusAsync());
    }

    private void OnRemoteActionReceived(object? sender, RemoteAction action)
    {
        Console.WriteLine($"🔔 OnRemoteActionReceived chamado - Action: {action.Action}");
        Console.WriteLine($"   Params count: {action.Params?.Count ?? 0}");
        if (action.Params != null && action.Params.Count > 0)
        {
            foreach (var param in action.Params)
            {
                Console.WriteLine($"   Param: {param.Key} = {param.Value}");
            }
        }
        _ = Task.Run(async () => await ExecuteRemoteActionAsync(action));
    }

        private async Task ExecuteRemoteActionAsync(RemoteAction action)
        {
            Console.WriteLine($"⚡ ExecuteRemoteActionAsync chamado - Action: {action.Action}");

            try
            {
            switch (action.Action)
            {
                case "lock_device":
                    LockDevice();
                    break;
                case "reboot_device":
                    RebootDevice();
                    break;
                case "shutdown_device":
                    ShutdownDevice();
                    break;
                case "run_script":
                    if (action.Params.TryGetValue("script", out var script))
                    {
                        await RunScriptAsync(script.ToString() ?? "");
                    }
                    break;
                case "install_software":
                    if (action.Params.TryGetValue("url", out var url))
                    {
                        await InstallSoftwareAsync(url.ToString() ?? "");
                    }
                    break;
                case "start_anydesk":
                    await StartAnyDeskAsync();
                    break;
                case "install_anydesk":
                    await _remoteAccessService.InstallAnyDeskAsync();
                    break;
                case "enable_rdp":
                    await _remoteAccessService.EnableRDPAsync();
                    break;
                case "start_remote_desktop":
                    Console.WriteLine($"🖥️ Recebido comando start_remote_desktop");
                    if (action.Params.TryGetValue("sessionId", out var sessionId))
                    {
                        var sessId = sessionId?.ToString() ?? Guid.NewGuid().ToString();
                        Console.WriteLine($"   SessionId recebido: {sessId}");
                        var started = _remoteDesktopService.StartSession(sessId);
                        Console.WriteLine($"   Sessão iniciada: {started}");
                        Console.WriteLine($"   IsSessionActive após iniciar: {_remoteDesktopService.IsSessionActive}");
                    }
                    else
                    {
                        Console.WriteLine($"   ⚠️ SessionId não encontrado nos params");
                    }
                    break;
                case "stop_remote_desktop":
                    _remoteDesktopService.StopSession();
                    break;
                default:
                    Console.WriteLine($"⚠️ Ação desconhecida: {action.Action}");
                    break;
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"❌ Erro ao executar ação: {ex.Message}");
        }
    }

    private void LockDevice()
    {
        Process.Start("rundll32.exe", "user32.dll,LockWorkStation");
    }

    private void RebootDevice()
    {
        Process.Start("shutdown", "/r /t 0");
    }

    private void ShutdownDevice()
    {
        Process.Start("shutdown", "/s /t 0");
    }

    private async Task RunScriptAsync(string script)
    {
        try
        {
            var process = new Process
            {
                StartInfo = new ProcessStartInfo
                {
                    FileName = "powershell.exe",
                    Arguments = $"-ExecutionPolicy Bypass -Command \"{script}\"",
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    Verb = "runas"
                }
            };
            process.Start();
            await process.WaitForExitAsync();
        }
        catch (Exception ex)
        {
            Console.WriteLine($"❌ Erro ao executar script: {ex.Message}");
        }
    }

    private async Task InstallSoftwareAsync(string url)
    {
        try
        {
            var fileName = Path.GetTempFileName() + ".exe";
            using var client = new HttpClient();
            var bytes = await client.GetByteArrayAsync(url);
            await File.WriteAllBytesAsync(fileName, bytes);

            var process = new Process
            {
                StartInfo = new ProcessStartInfo
                {
                    FileName = fileName,
                    UseShellExecute = true,
                    Verb = "runas"
                }
            };
            process.Start();
        }
        catch (Exception ex)
        {
            Console.WriteLine($"❌ Erro ao instalar software: {ex.Message}");
        }
    }

    private async Task StartAnyDeskAsync()
    {
        try
        {
            if (!_remoteAccessService.IsAnyDeskInstalled())
            {
                Console.WriteLine("⚠️ AnyDesk não está instalado");
                return;
            }

            var anyDeskPath = @"C:\Program Files (x86)\AnyDesk\AnyDesk.exe";
            if (!System.IO.File.Exists(anyDeskPath))
            {
                anyDeskPath = @"C:\Program Files\AnyDesk\AnyDesk.exe";
            }

            if (System.IO.File.Exists(anyDeskPath))
            {
                var process = new Process
                {
                    StartInfo = new ProcessStartInfo
                    {
                        FileName = anyDeskPath,
                        UseShellExecute = true
                    }
                };
                process.Start();
                Console.WriteLine("✅ AnyDesk iniciado");
                await Task.CompletedTask;
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"❌ Erro ao iniciar AnyDesk: {ex.Message}");
        }
    }

    private void OnDesktopFrameCaptured(object? sender, byte[] frame)
    {
        // Enviar frame via WebSocket para o servidor
        _ = Task.Run(async () => await _webSocketService.SendDesktopFrameAsync(frame, _remoteDesktopService.CurrentSessionId ?? ""));
    }

    private void OnDesktopSessionStarted(object? sender, string sessionId)
    {
        Console.WriteLine($"✅ Sessão de desktop remoto iniciada: {sessionId}");
        // Notificar o servidor que a sessão está ativa (usando SendDesktopFrameAsync como base)
        // Na verdade, a confirmação será feita quando o primeiro frame for enviado
        // Mas vamos adicionar um log para confirmar
        Console.WriteLine($"   📤 Sessão pronta para receber comandos de controle remoto");
    }

    private void OnDesktopSessionStopped(object? sender, string sessionId)
    {
        Console.WriteLine($"⏹️ Sessão de desktop remoto encerrada: {sessionId}");
    }
}


