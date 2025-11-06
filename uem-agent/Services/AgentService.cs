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
            var computerInfo = _systemInfoService.GetComputerInfo();
            await _webSocketService.SendComputerStatusAsync(computerInfo);
            Console.WriteLine($"✅ Status enviado: {computerInfo.Name}");
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
            if (location != null)
            {
                // Enviar localização junto com o status
                var computerInfo = _systemInfoService.GetComputerInfo();
                computerInfo.Latitude = location.Latitude;
                computerInfo.Longitude = location.Longitude;
                computerInfo.LocationAccuracy = location.Accuracy;
                await _webSocketService.SendComputerStatusAsync(computerInfo);
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
        _ = Task.Run(async () => await ExecuteRemoteActionAsync(action));
    }

    private async Task ExecuteRemoteActionAsync(RemoteAction action)
    {
        Console.WriteLine($"⚡ Executando ação remota: {action.Action}");

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
                    if (action.Params.TryGetValue("sessionId", out var sessionId))
                    {
                        var sessId = sessionId?.ToString() ?? Guid.NewGuid().ToString();
                        _remoteDesktopService.StartSession(sessId);
                    }
                    break;
                case "stop_remote_desktop":
                    _remoteDesktopService.StopSession();
                    break;
                case "remote_mouse_move":
                    if (action.Params.TryGetValue("x", out var x) && action.Params.TryGetValue("y", out var y))
                    {
                        _remoteDesktopService.SendMouseMove(Convert.ToInt32(x), Convert.ToInt32(y));
                    }
                    break;
                case "remote_mouse_click":
                    if (action.Params.TryGetValue("x", out var clickX) && action.Params.TryGetValue("y", out var clickY))
                    {
                        var button = action.Params.TryGetValue("button", out var btn) ? 
                            Enum.Parse<RemoteDesktopService.MouseButton>(btn.ToString() ?? "Left") : 
                            RemoteDesktopService.MouseButton.Left;
                        _remoteDesktopService.SendMouseClick(Convert.ToInt32(clickX), Convert.ToInt32(clickY), button);
                    }
                    break;
                case "remote_mouse_down":
                    if (action.Params.TryGetValue("x", out var downX) && action.Params.TryGetValue("y", out var downY))
                    {
                        var downButton = action.Params.TryGetValue("button", out var downBtn) ? 
                            Enum.Parse<RemoteDesktopService.MouseButton>(downBtn.ToString() ?? "Left") : 
                            RemoteDesktopService.MouseButton.Left;
                        _remoteDesktopService.SendMouseDown(Convert.ToInt32(downX), Convert.ToInt32(downY), downButton);
                    }
                    break;
                case "remote_mouse_up":
                    if (action.Params.TryGetValue("x", out var upX) && action.Params.TryGetValue("y", out var upY))
                    {
                        var upButton = action.Params.TryGetValue("button", out var upBtn) ? 
                            Enum.Parse<RemoteDesktopService.MouseButton>(upBtn.ToString() ?? "Left") : 
                            RemoteDesktopService.MouseButton.Left;
                        _remoteDesktopService.SendMouseUp(Convert.ToInt32(upX), Convert.ToInt32(upY), upButton);
                    }
                    break;
                case "remote_mouse_wheel":
                    if (action.Params.TryGetValue("delta", out var delta))
                    {
                        _remoteDesktopService.SendMouseWheel(Convert.ToInt32(delta));
                    }
                    break;
                case "remote_key_press":
                    if (action.Params.TryGetValue("keyCode", out var keyCode))
                    {
                        _remoteDesktopService.SendKeyPress(Convert.ToUInt16(keyCode));
                    }
                    break;
                case "remote_key_down":
                    if (action.Params.TryGetValue("keyCode", out var keyDownCode))
                    {
                        _remoteDesktopService.SendKeyDown(Convert.ToUInt16(keyDownCode));
                    }
                    break;
                case "remote_key_up":
                    if (action.Params.TryGetValue("keyCode", out var keyUpCode))
                    {
                        _remoteDesktopService.SendKeyUp(Convert.ToUInt16(keyUpCode));
                    }
                    break;
                case "remote_text":
                    if (action.Params.TryGetValue("text", out var text))
                    {
                        _remoteDesktopService.SendText(text.ToString() ?? "");
                    }
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
}


