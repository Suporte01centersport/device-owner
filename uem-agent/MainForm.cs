using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.DependencyInjection;
using System.Drawing;
using System.Threading.Tasks;
using UEMAgent.Services;

namespace UEMAgent;

public partial class MainForm : Form
{
    private readonly IHost _host;
    private readonly AdminPasswordService _adminPasswordService;
    private readonly WebSocketService _webSocketService;
    private System.Windows.Forms.Timer? _updateTimer;
    private Label? _statusLabel;
    private Label? _connectionLabel;
    private Button? _exitButton;
    private NotifyIcon? _notifyIcon;
    private ContextMenuStrip? _contextMenu;

    public MainForm(IHost host)
    {
        _host = host;
        _adminPasswordService = host.Services.GetRequiredService<AdminPasswordService>();
        _webSocketService = host.Services.GetRequiredService<WebSocketService>();
        InitializeComponent();
        InitializeSystemTray();
    }

    private void InitializeComponent()
    {
        this.Text = "UEM Agent - Gerenciamento de Endpoints";
        this.Size = new Size(450, 280);
        this.FormBorderStyle = FormBorderStyle.FixedDialog;
        this.MaximizeBox = false;
        this.MinimizeBox = true;
        this.StartPosition = FormStartPosition.CenterScreen;
        this.ShowInTaskbar = true;
        this.WindowState = FormWindowState.Normal;
        this.MinimumSize = new Size(450, 280);
        
        // Evento para quando o formulário é minimizado
        this.Resize += MainForm_Resize;
        
        // Garantir que a janela apareça quando criada
        this.Load += (s, e) => {
            this.Show();
            this.Activate();
            this.BringToFront();
        };

        _statusLabel = new Label
        {
            Text = "Status: Inicializando...",
            Location = new Point(20, 20),
            Size = new Size(400, 30),
            Font = new Font("Segoe UI", 10, FontStyle.Bold)
        };
        this.Controls.Add(_statusLabel);

        _connectionLabel = new Label
        {
            Text = "Conexão: Desconectado",
            Location = new Point(20, 60),
            Size = new Size(400, 30),
            Font = new Font("Segoe UI", 10)
        };
        this.Controls.Add(_connectionLabel);
        
        var infoLabel = new Label
        {
            Text = "O agente continuará rodando em segundo plano na bandeja do sistema quando você fechar esta janela.",
            Location = new Point(20, 100),
            Size = new Size(400, 50),
            Font = new Font("Segoe UI", 9),
            ForeColor = Color.Gray
        };
        this.Controls.Add(infoLabel);

        _exitButton = new Button
        {
            Text = "Minimizar para Bandeja",
            Location = new Point(120, 160),
            Size = new Size(200, 35),
            Font = new Font("Segoe UI", 9)
        };
        _exitButton.Click += (s, e) => {
            this.WindowState = FormWindowState.Minimized;
            this.Hide();
            this.ShowInTaskbar = false;
        };
        this.Controls.Add(_exitButton);
        
        var exitButton = new Button
        {
            Text = "Sair Completamente",
            Location = new Point(120, 200),
            Size = new Size(200, 30),
            Font = new Font("Segoe UI", 9),
            ForeColor = Color.DarkRed
        };
        exitButton.Click += (s, e) => ExitApplication();
        this.Controls.Add(exitButton);

        // Timer para atualizar status
        _updateTimer = new System.Windows.Forms.Timer
        {
            Interval = 5000
        };
        _updateTimer.Tick += UpdateStatus;
        _updateTimer.Start();

        // Iniciar serviços de forma assíncrona para não bloquear a UI
        Task.Run(async () =>
        {
            try
            {
                await _host.StartAsync();
            }
            catch (Exception ex)
            {
                // Se houver erro ao iniciar, mostrar na UI
                if (_statusLabel != null)
                {
                    this.Invoke((MethodInvoker)delegate
                    {
                        _statusLabel.Text = $"Erro: {ex.Message}";
                        _statusLabel.ForeColor = Color.Red;
                    });
                }
            }
        });
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
        if (!AuthorizeShutdown())
        {
            return;
        }

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
            _statusLabel.Text = "Status: Ativo e rodando";
            _statusLabel.ForeColor = Color.Green;
        }

        // Atualizar status de conexão via WebSocket
        try
        {
            var webSocketService = _host.Services.GetService(typeof(Services.WebSocketService)) as Services.WebSocketService;
            if (_connectionLabel != null && webSocketService != null)
            {
                var isConnected = webSocketService.IsConnected;
                _connectionLabel.Text = isConnected 
                    ? "Conexão: Conectado ao servidor" 
                    : "Conexão: Desconectado";
                _connectionLabel.ForeColor = isConnected ? Color.Green : Color.Orange;
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

    private bool AuthorizeShutdown()
    {
        if (!_adminPasswordService.HasPassword)
        {
            _ = _webSocketService.RequestAdminPasswordAsync();
            MessageBox.Show(
                "Não foi possível validar a senha de administrador. Verifique a sincronização com o servidor e tente novamente.",
                "Senha não sincronizada",
                MessageBoxButtons.OK,
                MessageBoxIcon.Warning);
            return false;
        }

        const int maxAttempts = 3;

        for (var attempt = 0; attempt < maxAttempts; attempt++)
        {
            using var prompt = new PasswordPromptForm();
            var dialogResult = prompt.ShowDialog(this);
            if (dialogResult != DialogResult.OK)
            {
                return false;
            }

            var enteredPassword = prompt.EnteredPassword;
            if (_adminPasswordService.ValidatePassword(enteredPassword))
            {
                return true;
            }

            MessageBox.Show(
                "Senha incorreta. Tente novamente.",
                "Acesso negado",
                MessageBoxButtons.OK,
                MessageBoxIcon.Warning);
        }

        MessageBox.Show(
            "Número máximo de tentativas atingido. Encerramento bloqueado.",
            "Acesso negado",
            MessageBoxButtons.OK,
            MessageBoxIcon.Error);

        return false;
    }
}

