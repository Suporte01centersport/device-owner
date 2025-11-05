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

    public MainForm(IHost host)
    {
        _host = host;
        InitializeComponent();
    }

    private void InitializeComponent()
    {
        this.Text = "UEM Agent";
        this.Size = new Size(400, 200);
        this.FormBorderStyle = FormBorderStyle.FixedDialog;
        this.MaximizeBox = false;
        this.MinimizeBox = true;
        this.StartPosition = FormStartPosition.CenterScreen;

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
        _exitButton.Click += (s, e) => Application.Exit();
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
        _updateTimer?.Stop();
        _host.StopAsync();
        base.OnFormClosing(e);
    }
}

