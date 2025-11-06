using System.Diagnostics;

namespace UEMAgent.Services;

public class RemoteDesktopService : IDisposable
{
    private readonly ScreenCaptureService _screenCapture;
    private bool _isSessionActive = false;
    private string? _currentSessionId;

    public RemoteDesktopService(ScreenCaptureService screenCapture)
    {
        _screenCapture = screenCapture;
        _screenCapture.FrameCaptured += OnFrameCaptured;
    }

    public event EventHandler<byte[]>? FrameCaptured;
    public event EventHandler<string>? SessionStarted;
    public event EventHandler<string>? SessionStopped;

    public bool StartSession(string sessionId)
    {
        if (_isSessionActive)
        {
            return false;
        }

        _currentSessionId = sessionId;
        _isSessionActive = true;
        
        // Obter tamanho real do monitor principal para manter proporção
        var screenSize = _screenCapture.GetScreenSize();
        var screenWidth = screenSize.Width;
        var screenHeight = screenSize.Height;
        
        // Calcular resolução mantendo proporção (máximo 1920x1080 para performance)
        // Aumentar para 2560x1440 se necessário para melhor qualidade em telas grandes
        int maxWidth = 1920;
        int maxHeight = 1080;
        
        int targetWidth = screenWidth;
        int targetHeight = screenHeight;
        
        if (screenWidth > maxWidth || screenHeight > maxHeight)
        {
            var scale = Math.Min((double)maxWidth / screenWidth, (double)maxHeight / screenHeight);
            targetWidth = (int)(screenWidth * scale);
            targetHeight = (int)(screenHeight * scale);
            
            // Garantir que seja múltiplo de 2 (melhor para compressão)
            targetWidth = (targetWidth / 2) * 2;
            targetHeight = (targetHeight / 2) * 2;
        }
        
        // Iniciar captura com 15 FPS para melhor fluidez (aumentado de 10 para 15)
        _screenCapture.StartCapture(fps: 15, width: targetWidth, height: targetHeight);
        
        SessionStarted?.Invoke(this, sessionId);
        
        return true;
    }

    public void StopSession()
    {
        if (!_isSessionActive)
            return;

        _isSessionActive = false;
        _screenCapture.StopCapture();
        
        var sessionId = _currentSessionId ?? "unknown";
        _currentSessionId = null;
        
        SessionStopped?.Invoke(this, sessionId);
    }

    public bool IsSessionActive => _isSessionActive;
    public string? CurrentSessionId => _currentSessionId;

    private void OnFrameCaptured(object? sender, byte[] frame)
    {
        if (_isSessionActive)
        {
            FrameCaptured?.Invoke(this, frame);
        }
    }

    // Métodos de injeção de input removidos - apenas visualização de tela

    public void Dispose()
    {
        StopSession();
        _screenCapture.FrameCaptured -= OnFrameCaptured;
    }
}

