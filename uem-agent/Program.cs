using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using UEMAgent.Services;
using UEMAgent.Data;

namespace UEMAgent;

internal static class Program
{
    [STAThread]
    static void Main()
    {
        ApplicationConfiguration.Initialize();

        // Criar host builder
        var host = Host.CreateDefaultBuilder()
            .ConfigureServices((context, services) =>
            {
                var configuration = context.Configuration;
                
                // Configurações
                services.Configure<AppSettings>(configuration);
                
                // Serviços
                services.AddSingleton<SystemInfoService>();
                services.AddSingleton<RemoteAccessService>();
                services.AddSingleton<LocationService>();
                services.AddSingleton<ScreenCaptureService>();
                services.AddSingleton<RemoteDesktopService>((sp) =>
                {
                    var screenCapture = sp.GetRequiredService<ScreenCaptureService>();
                    return new RemoteDesktopService(screenCapture);
                });
                services.AddSingleton<WebSocketService>((sp) => 
                {
                    var settings = sp.GetRequiredService<IOptions<AppSettings>>();
                    var remoteAccessService = sp.GetRequiredService<RemoteAccessService>();
                    return new WebSocketService(settings, remoteAccessService);
                });
                services.AddHostedService<AgentService>();
            })
            .Build();

        // Executar como serviço ou aplicação
        Application.Run(new MainForm(host));
    }
}


