using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.DependencyInjection;

namespace UEMAgent;

public partial class MainForm : Form
{
    private readonly IHost _host;
    private System.Windows.Forms.Timer? _updateTimer;
    private Label? _statusLabel;
    private Label? _connectionLabel;
    private Button? _exitButton;
    private NotifyIcon? _notifyIcon;
    private ContextMenuStrip? _contextMenu;

    public MainForm(IHost host)
    {
        _host = host;
        InitializeComponent();
        InitializeSystemTray();
    }

    private void InitializeComponent()
    {
        this.Text = "UEM Agent";
        this.Size = new Size(400, 200);
        this.FormBorderStyle = FormBorderStyle.FixedDialog;
        this.MaximizeBox = false;
        this.MinimizeBox = true;
        this.StartPosition = FormStartPosition.CenterScreen;
        this.ShowInTaskbar = true;
        this.WindowState = FormWindowState.Normal;
        
        // Evento para quando o formulário é minimizado
        this.Resize += MainForm_Resize;

        _statusLabel = new Label
        {
            Text = "Status: Inicializando...",
            Location = new Point(20, 20),
            Size = new Size(360, 30),
            Font = new Font("Segoe UI", 10)
        };
        this.Controls.Add(_statusLabel);

        _connectionLabel = new Label
        {
            Text = "Conexão: Desconectado",
            Location = new Point(20, 60),
            Size = new Size(360, 30),
            Font = new Font("Segoe UI", 10)
        };
        this.Controls.Add(_connectionLabel);

        _exitButton = new Button
        {
            Text = "Sair",
            Location = new Point(150, 120),
            Size = new Size(100, 30)
        };
        _exitButton.Click += (s, e) => ExitApplication();
        this.Controls.Add(_exitButton);

        // Timer para atualizar status
        _updateTimer = new System.Windows.Forms.Timer
        {
            Interval = 5000
        };
        _updateTimer.Tick += UpdateStatus;
        _updateTimer.Start();

        // Iniciar serviços
        _host.Start();
    }

    private void InitializeSystemTray()
    {
        // Criar menu de contexto para o ícone da bandeja
        _contextMenu = new ContextMenuStrip();
        
        var showMenuItem = new ToolStripMenuItem("Mostrar");
        showMenuItem.Click += (s, e) => ShowWindow();
        _contextMenu.Items.Add(showMenuItem);
        
        _contextMenu.Items.Add(new ToolStripSeparator());
        
        var exitMenuItem = new ToolStripMenuItem("Sair");
        exitMenuItem.Click += (s, e) => ExitApplication();
        _contextMenu.Items.Add(exitMenuItem);

        // Criar NotifyIcon
        _notifyIcon = new NotifyIcon
        {
            Icon = SystemIcons.Application, // Usar ícone padrão do sistema
            Text = "UEM Agent - Gerenciamento de Endpoints",
            Visible = true,
            ContextMenuStrip = _contextMenu
        };

        // Evento de clique duplo no ícone para restaurar janela
        _notifyIcon.DoubleClick += (s, e) => ShowWindow();
        
        // Evento de clique único para mostrar menu
        _notifyIcon.MouseClick += (s, e) =>
        {
            if (e.Button == MouseButtons.Left)
            {
                ShowWindow();
            }
        };

        // Atualizar tooltip do ícone periodicamente
        var tooltipTimer = new System.Windows.Forms.Timer
        {
            Interval = 5000
        };
        tooltipTimer.Tick += (s, e) => UpdateTrayIconTooltip();
        tooltipTimer.Start();
    }

    private void MainForm_Resize(object? sender, EventArgs e)
    {
        // Quando o formulário é minimizado, escondê-lo e mostrar apenas na bandeja
        if (this.WindowState == FormWindowState.Minimized)
        {
            this.Hide();
            this.ShowInTaskbar = false;
            
            if (_notifyIcon != null)
            {
                _notifyIcon.BalloonTipTitle = "UEM Agent";
                _notifyIcon.BalloonTipText = "O agente foi minimizado para a bandeja do sistema. Clique duas vezes para restaurar.";
                _notifyIcon.BalloonTipIcon = ToolTipIcon.Info;
                _notifyIcon.ShowBalloonTip(3000);
            }
        }
    }

    private void ShowWindow()
    {
        this.Show();
        this.WindowState = FormWindowState.Normal;
        this.ShowInTaskbar = true;
        this.Activate();
        this.BringToFront();
    }

    private void UpdateTrayIconTooltip()
    {
        if (_notifyIcon == null) return;

        try
        {
            var webSocketService = _host.Services.GetService(typeof(Services.WebSocketService)) as Services.WebSocketService;
            var isConnected = webSocketService?.IsConnected ?? false;
            var statusText = isConnected ? "Conectado" : "Desconectado";
            
            _notifyIcon.Text = $"UEM Agent - {statusText}";
            
            // Mudar ícone baseado no status (opcional)
            _notifyIcon.Icon = isConnected ? SystemIcons.Application : SystemIcons.Warning;
        }
        catch
        {
            // Ignorar erros
        }
    }

    private void ExitApplication()
    {
        if (_notifyIcon != null)
        {
            _notifyIcon.Visible = false;
            _notifyIcon.Dispose();
        }
        
        _updateTimer?.Stop();
        _host.StopAsync().Wait();
        Application.Exit();
    }

    private void UpdateStatus(object? sender, EventArgs e)
    {
        if (_statusLabel != null)
        {
            _statusLabel.Text = "Status: Ativo";
        }

        // Atualizar status de conexão via WebSocket
        try
        {
            var webSocketService = _host.Services.GetService(typeof(Services.WebSocketService)) as Services.WebSocketService;
            if (_connectionLabel != null && webSocketService != null)
            {
                _connectionLabel.Text = webSocketService.IsConnected 
                    ? "Conexão: Conectado" 
                    : "Conexão: Desconectado";
            }
        }
        catch
        {
            // Ignorar erros ao obter serviço
        }
    }

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        // Se o usuário está tentando fechar, minimizar para a bandeja em vez de fechar
        if (e.CloseReason == CloseReason.UserClosing)
        {
            e.Cancel = true;
            this.WindowState = FormWindowState.Minimized;
            this.Hide();
            this.ShowInTaskbar = false;
            
            if (_notifyIcon != null)
            {
                _notifyIcon.BalloonTipTitle = "UEM Agent";
                _notifyIcon.BalloonTipText = "O agente continua rodando em segundo plano. Clique duas vezes no ícone para restaurar.";
                _notifyIcon.BalloonTipIcon = ToolTipIcon.Info;
                _notifyIcon.ShowBalloonTip(3000);
            }
        }
        else
        {
            // Se está realmente fechando (não pelo usuário), limpar recursos
            _updateTimer?.Stop();
            _host.StopAsync().Wait();
            
            if (_notifyIcon != null)
            {
                _notifyIcon.Visible = false;
                _notifyIcon.Dispose();
            }
            
            base.OnFormClosing(e);
        }
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _notifyIcon?.Dispose();
            _contextMenu?.Dispose();
            _updateTimer?.Dispose();
        }
        base.Dispose(disposing);
    }
}

