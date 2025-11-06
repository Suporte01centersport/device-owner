using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Logging;
using UEMAgent.Services;
using UEMAgent.Data;
using System.Diagnostics;
using System.Windows.Forms;

namespace UEMAgent;

internal static class Program
{
    static void Main(string[] args)
    {
        try
        {
            // Verificar se deve rodar como serviço
            // Quando rodando como Windows Service, Environment.UserInteractive será false
            // Quando executado diretamente pelo usuário, Environment.UserInteractive será true
            var hasServiceArg = args.Contains("--service");
            var isUserInteractive = Environment.UserInteractive;
            var isDebuggerAttached = Debugger.IsAttached;
            
            // Detectar se está rodando como serviço:
            // 1. Se tiver argumento --service (forçado)
            // 2. Se NÃO for interativo E não estiver com debugger (rodando como serviço do Windows)
            var isService = hasServiceArg || (!isUserInteractive && !isDebuggerAttached);
            
            // Log de debug (escrever em arquivo para diagnóstico)
            var logDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "UEMAgent");
            try
            {
                Directory.CreateDirectory(logDir);
                File.AppendAllText(
                    Path.Combine(logDir, "startup.log"),
                    $"[{DateTime.Now}] Args: [{string.Join(", ", args)}], UserInteractive: {isUserInteractive}, DebuggerAttached: {isDebuggerAttached}, HasServiceArg: {hasServiceArg}, IsService: {isService}\n");
            }
            catch (Exception logEx)
            {
                // Se não conseguir escrever log, pelo menos tentar no Event Viewer
                try
                {
                    if (!System.Diagnostics.EventLog.SourceExists("UEMAgent"))
                    {
                        System.Diagnostics.EventLog.CreateEventSource("UEMAgent", "Application");
                    }
                    using var eventLog = new System.Diagnostics.EventLog("Application") { Source = "UEMAgent" };
                    eventLog.WriteEntry($"Erro ao escrever log: {logEx.Message}", System.Diagnostics.EventLogEntryType.Warning);
                }
                catch { }
            }
            
            // Rodar como serviço se detectado como serviço
            if (isService)
            {
                // Rodar como Windows Service (LocalSystem)
                var host = Host.CreateDefaultBuilder(args)
                    .UseWindowsService(options =>
                    {
                        options.ServiceName = "UEMAgent";
                    })
                    .ConfigureLogging(logging =>
                    {
                        logging.AddEventLog(settings =>
                        {
                            settings.SourceName = "UEMAgent";
                            settings.LogName = "Application";
                        });
                        logging.AddConsole();
                    })
                    .ConfigureServices((context, services) => ConfigureServices(services, context))
                    .Build();
                host.Run();
            }
            else
            {
                // Rodar como aplicação Windows Forms com interface gráfica e bandeja do sistema
                try
                {
                    // Log
                    try
                    {
                        File.AppendAllText(Path.Combine(logDir, "startup.log"), $"[{DateTime.Now}] Iniciando modo interface gráfica...\n");
                    }
                    catch { }
                    
                    // Configurar Windows Forms
                    Application.SetHighDpiMode(HighDpiMode.SystemAware);
                    Application.EnableVisualStyles();
                    Application.SetCompatibleTextRenderingDefault(false);
                    
                    // Log
                    try
                    {
                        File.AppendAllText(Path.Combine(logDir, "startup.log"), $"[{DateTime.Now}] Windows Forms configurado, construindo host...\n");
                    }
                    catch { }
                    
                    // Construir host (sem UseWindowsService)
                    var host = CreateHostBuilder(args, false).Build();
                    
                    // Log
                    try
                    {
                        File.AppendAllText(Path.Combine(logDir, "startup.log"), $"[{DateTime.Now}] Host construído, criando MainForm...\n");
                    }
                    catch { }
                    
                    // Criar e mostrar formulário principal
                    var mainForm = new MainForm(host);
                    
                    // Log
                    try
                    {
                        File.AppendAllText(Path.Combine(logDir, "startup.log"), $"[{DateTime.Now}] MainForm criado, mostrando janela...\n");
                    }
                    catch { }
                    
                    // Garantir que a janela apareça
                    mainForm.Show();
                    mainForm.WindowState = FormWindowState.Normal;
                    mainForm.Activate();
                    mainForm.BringToFront();
                    mainForm.Focus();
                    
                    // Log
                    try
                    {
                        File.AppendAllText(Path.Combine(logDir, "startup.log"), $"[{DateTime.Now}] Janela mostrada, iniciando Application.Run...\n");
                    }
                    catch { }
                    
                    // Executar aplicação
                    Application.Run(mainForm);
                    
                    // Log
                    try
                    {
                        File.AppendAllText(Path.Combine(logDir, "startup.log"), $"[{DateTime.Now}] Application.Run finalizado\n");
                    }
                    catch { }
                }
                catch (Exception ex)
                {
                    // Log do erro
                    try
                    {
                        File.AppendAllText(Path.Combine(logDir, "startup.log"), 
                            $"[{DateTime.Now}] ERRO: {ex.Message}\nStack: {ex.StackTrace}\n\n");
                    }
                    catch { }
                    
                    // Mostrar mensagem de erro ao usuário
                    try
                    {
                        MessageBox.Show(
                            $"Erro ao iniciar UEM Agent:\n\n{ex.Message}\n\nDetalhes: {ex.StackTrace}",
                            "Erro - UEM Agent",
                            MessageBoxButtons.OK,
                            MessageBoxIcon.Error);
                    }
                    catch
                    {
                        // Se não conseguir mostrar MessageBox, tentar console
                        Console.Error.WriteLine($"Erro ao iniciar UEM Agent: {ex.Message}");
                        Console.Error.WriteLine($"Stack Trace: {ex.StackTrace}");
                    }
                    
                    // Registrar no Event Log também
                    try
                    {
                        if (!System.Diagnostics.EventLog.SourceExists("UEMAgent"))
                        {
                            System.Diagnostics.EventLog.CreateEventSource("UEMAgent", "Application");
                        }
                        using var eventLog = new System.Diagnostics.EventLog("Application")
                        {
                            Source = "UEMAgent"
                        };
                        eventLog.WriteEntry($"Erro ao iniciar interface gráfica: {ex.Message}\n\n{ex.StackTrace}", 
                            System.Diagnostics.EventLogEntryType.Error);
                    }
                    catch { }
                    
                    throw;
                }
            }
        }
        catch (Exception ex)
        {
            // Tentar mostrar mensagem de erro ao usuário (se possível)
            try
            {
                if (Environment.UserInteractive)
                {
                    MessageBox.Show(
                        $"Erro fatal ao iniciar UEM Agent:\n\n{ex.Message}\n\nDetalhes: {ex.StackTrace}",
                        "Erro Fatal - UEM Agent",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Error);
                }
            }
            catch { }
            
            // Registrar erro no Event Log do Windows
            try
            {
                if (!System.Diagnostics.EventLog.SourceExists("UEMAgent"))
                {
                    System.Diagnostics.EventLog.CreateEventSource("UEMAgent", "Application");
                }
                using var eventLog = new System.Diagnostics.EventLog("Application")
                {
                    Source = "UEMAgent"
                };
                eventLog.WriteEntry($"Erro fatal ao iniciar UEM Agent: {ex.Message}\n\nStack Trace:\n{ex.StackTrace}", 
                    System.Diagnostics.EventLogEntryType.Error);
            }
            catch
            {
                // Se não conseguir escrever no Event Log, pelo menos tentar escrever em arquivo
                try
                {
                    var logDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "UEMAgent");
                    Directory.CreateDirectory(logDir);
                    File.WriteAllText(
                        Path.Combine(logDir, "error.log"),
                        $"[{DateTime.Now}] Erro fatal: {ex.Message}\n\n{ex.StackTrace}");
                }
                catch
                {
                    // Se tudo falhar, pelo menos mostrar no console (se disponível)
                    Console.Error.WriteLine($"Erro fatal: {ex.Message}");
                }
            }
            
            Environment.Exit(1);
        }
    }

    static IHostBuilder CreateHostBuilder(string[] args, bool isService = false) =>
        Host.CreateDefaultBuilder(args)
            .ConfigureLogging(logging =>
            {
                if (isService)
                {
                    logging.AddEventLog(settings =>
                    {
                        settings.SourceName = "UEMAgent";
                        settings.LogName = "Application";
                    });
                }
                logging.AddConsole();
            })
            .ConfigureServices((context, services) => ConfigureServices(services, context));
    
    static void ConfigureServices(IServiceCollection services, HostBuilderContext context)
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
    }
}


