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

    public AgentService(
        IOptions<AppSettings> settings,
        SystemInfoService systemInfoService,
        WebSocketService webSocketService,
        LocationService locationService,
        RemoteAccessService remoteAccessService)
    {
        _settings = settings.Value;
        _systemInfoService = systemInfoService;
        _webSocketService = webSocketService;
        _locationService = locationService;
        _remoteAccessService = remoteAccessService;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Configurar eventos
        _webSocketService.OnStatusUpdateRequested += OnStatusUpdateRequested;
        _webSocketService.OnRemoteActionReceived += OnRemoteActionReceived;

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
                // Reconectar se necessário
                if (!_webSocketService.IsConnected)
                {
                    await _webSocketService.ConnectAsync();
                }

                // Enviar status periodicamente
                await SendComputerStatusAsync();

                // Enviar localização periodicamente
                await SendLocationAsync();

                // Aguardar intervalo
                await Task.Delay(_settings.UpdateInterval, stoppingToken);
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
}


