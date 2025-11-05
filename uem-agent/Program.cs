using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
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
                services.AddSingleton<WebSocketService>();
                services.AddSingleton<LocationService>();
                services.AddSingleton<RemoteAccessService>();
                services.AddHostedService<AgentService>();
            })
            .Build();

        // Executar como serviço ou aplicação
        Application.Run(new MainForm(host));
    }
}


