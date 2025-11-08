using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

namespace UEMAgent.Services;

public class ScreenCaptureService : IDisposable
{
    private bool _isCapturing = false;
    private CancellationTokenSource? _cancellationTokenSource;
    private readonly object _lockObject = new object();
    private Bitmap? _currentFrame;
    
    public event EventHandler<byte[]>? FrameCaptured;

    [DllImport("user32.dll")]
    private static extern IntPtr GetDesktopWindow();

    [DllImport("user32.dll")]
    private static extern IntPtr GetWindowDC(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern IntPtr ReleaseDC(IntPtr hWnd, IntPtr hDC);

    [DllImport("gdi32.dll")]
    private static extern IntPtr CreateCompatibleBitmap(IntPtr hdc, int nWidth, int nHeight);

    [DllImport("gdi32.dll")]
    private static extern IntPtr CreateCompatibleDC(IntPtr hdc);

    [DllImport("gdi32.dll")]
    private static extern IntPtr SelectObject(IntPtr hdc, IntPtr hgdiobj);

    [DllImport("gdi32.dll")]
    private static extern bool DeleteObject(IntPtr hObject);

    [DllImport("gdi32.dll")]
    private static extern bool BitBlt(IntPtr hObject, int nXDest, int nYDest, int nWidth, int nHeight,
        IntPtr hObjectSource, int nXSrc, int nYSrc, int dwRop);

    private const int SRCCOPY = 0x00CC0020;

    public void StartCapture(int fps = 10, int? width = null, int? height = null)
    {
        if (_isCapturing)
            return;

        _isCapturing = true;
        _cancellationTokenSource = new CancellationTokenSource();

        _ = Task.Run(async () => await CaptureLoopAsync(fps, width, height, _cancellationTokenSource.Token));
    }

    public void StopCapture()
    {
        if (!_isCapturing)
            return;

        _isCapturing = false;
        _cancellationTokenSource?.Cancel();
        _cancellationTokenSource?.Dispose();
    }

    private async Task CaptureLoopAsync(int fps, int? targetWidth, int? targetHeight, CancellationToken cancellationToken)
    {
        // Usar Stopwatch para timing mais preciso
        var frameTime = TimeSpan.FromMilliseconds(1000.0 / fps);
        var sw = System.Diagnostics.Stopwatch.StartNew();
        var nextFrameTime = sw.Elapsed;

        while (!cancellationToken.IsCancellationRequested && _isCapturing)
        {
            try
            {
                var frameStart = sw.Elapsed;
                
                var frame = CaptureScreen(targetWidth, targetHeight);
                if (frame != null)
                {
                    // Converter para JPEG com qualidade adaptativa
                    // Qualidade baseada no tamanho: imagens menores podem ter qualidade maior
                    var quality = CalculateOptimalQuality(frame.Width, frame.Height);
                    var jpegBytes = BitmapToJpeg(frame, quality);
                    
                    // Atualizar frame atual (para possível uso futuro)
                    lock (_lockObject)
                    {
                        _currentFrame?.Dispose();
                        _currentFrame = frame; // Manter referência (não liberar ainda)
                    }
                    
                    // Disparar evento (usa os bytes JPEG, não o bitmap)
                    FrameCaptured?.Invoke(this, jpegBytes);
                }
                
                // Calcular tempo até próximo frame (compensar tempo de processamento)
                nextFrameTime += frameTime;
                var delay = nextFrameTime - sw.Elapsed;
                
                if (delay > TimeSpan.Zero)
                {
                    await Task.Delay(delay, cancellationToken);
                }
                else
                {
                    // Se estamos atrasados, pular para próximo frame imediatamente
                    nextFrameTime = sw.Elapsed;
                    await Task.Yield(); // Dar chance para outras tarefas
                }
            }
            catch (Exception)
            {
                // Silenciosamente ignorar erros de captura (evitar spam de logs)
            }
        }
    }

    private Bitmap? CaptureScreen(int? targetWidth, int? targetHeight)
    {
        try
        {
            // Obter apenas o monitor principal (ignorar monitores secundários)
            var primaryScreen = Screen.PrimaryScreen;
            if (primaryScreen == null)
            {
                Console.WriteLine("⚠️ Nenhum monitor principal encontrado");
                return null;
            }
                
            // Garantir que estamos capturando apenas o monitor principal
            var screenBounds = primaryScreen.Bounds;
            var screenWidth = screenBounds.Width;
            var screenHeight = screenBounds.Height;
            var screenX = screenBounds.X;
            var screenY = screenBounds.Y;

            // Calcular tamanho de saída (usar resolução real se não especificado)
            var outputWidth = targetWidth ?? screenWidth;
            var outputHeight = targetHeight ?? screenHeight;
            
            // Garantir que seja múltiplo de 2 (melhor para compressão JPEG)
            outputWidth = (outputWidth / 2) * 2;
            outputHeight = (outputHeight / 2) * 2;

            // Criar bitmap
            var bitmap = new Bitmap(outputWidth, outputHeight, PixelFormat.Format24bppRgb);

            using (var graphics = Graphics.FromImage(bitmap))
            {
                // Capturar apenas o monitor principal
                // Usar screenX e screenY para garantir que capturamos da posição correta
                graphics.CopyFromScreen(screenX, screenY, 0, 0, new Size(screenWidth, screenHeight));
                
                // Redimensionar se necessário (mantendo proporção)
                if (outputWidth != screenWidth || outputHeight != screenHeight)
                {
                    var resized = new Bitmap(outputWidth, outputHeight, PixelFormat.Format24bppRgb);
                    using (var g = Graphics.FromImage(resized))
                    {
                        // Configurações otimizadas para melhor qualidade e performance
                        g.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
                        g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.HighQuality;
                        g.PixelOffsetMode = System.Drawing.Drawing2D.PixelOffsetMode.HighQuality;
                        g.CompositingQuality = System.Drawing.Drawing2D.CompositingQuality.HighQuality;
                        
                        // Usar Rectangle para melhor qualidade
                        var destRect = new Rectangle(0, 0, outputWidth, outputHeight);
                        var srcRect = new Rectangle(0, 0, screenWidth, screenHeight);
                        g.DrawImage(bitmap, destRect, srcRect, GraphicsUnit.Pixel);
                    }
                    bitmap.Dispose();
                    return resized;
                }
            }

            return bitmap;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"❌ Erro na captura: {ex.Message}");
            Console.WriteLine($"   Stack trace: {ex.StackTrace}");
            return null;
        }
    }

    private int CalculateOptimalQuality(int width, int height)
    {
        // Calcular qualidade baseada na resolução
        // Resoluções menores podem ter qualidade maior (menos dados para comprimir)
        // Resoluções maiores precisam de qualidade menor para manter tamanho do arquivo razoável
        
        var totalPixels = width * height;
        
        // Qualidade adaptativa:
        // - Até 1MP (1.000.000 pixels): 85% qualidade
        // - 1MP a 2MP: 80% qualidade
        // - 2MP a 3MP: 75% qualidade
        // - Acima de 3MP: 70% qualidade
        if (totalPixels <= 1_000_000)
            return 85;
        else if (totalPixels <= 2_000_000)
            return 80;
        else if (totalPixels <= 3_000_000)
            return 75;
        else
            return 70;
    }

    private byte[] BitmapToJpeg(Bitmap bitmap, int quality)
    {
        using (var ms = new MemoryStream())
        {
            var encoder = ImageCodecInfo.GetImageEncoders()
                .FirstOrDefault(c => c.FormatID == ImageFormat.Jpeg.Guid);
            
            if (encoder != null)
            {
                // Usar múltiplos parâmetros para melhor compressão
                var encoderParams = new EncoderParameters(2);
                encoderParams.Param[0] = new EncoderParameter(Encoder.Quality, (long)quality);
                
                // Habilitar otimização de cor (melhor compressão)
                encoderParams.Param[1] = new EncoderParameter(
                    Encoder.ColorDepth, 
                    (long)ColorDepth.Depth24Bit
                );
                
                // Configurar opções de compressão
                bitmap.Save(ms, encoder, encoderParams);
                encoderParams.Dispose();
            }
            else
            {
                // Fallback: salvar sem encoder específico
                bitmap.Save(ms, ImageFormat.Jpeg);
            }
            
            return ms.ToArray();
        }
    }

    public Size GetScreenSize()
    {
        var primaryScreen = Screen.PrimaryScreen;
        if (primaryScreen == null)
            return new Size(1920, 1080); // Tamanho padrão caso não haja tela
        
        return primaryScreen.Bounds.Size;
    }

    public void Dispose()
    {
        StopCapture();
        _currentFrame?.Dispose();
    }
}
