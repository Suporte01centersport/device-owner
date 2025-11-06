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
        var delay = 1000 / fps;

        while (!cancellationToken.IsCancellationRequested && _isCapturing)
        {
            try
            {
                var frame = CaptureScreen(targetWidth, targetHeight);
                if (frame != null)
                {
                    lock (_lockObject)
                    {
                        _currentFrame?.Dispose();
                        _currentFrame = frame;
                    }

                    // Converter para JPEG
                    var jpegBytes = BitmapToJpeg(frame, 70); // 70% qualidade
                    FrameCaptured?.Invoke(this, jpegBytes);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"❌ Erro ao capturar tela: {ex.Message}");
            }

            await Task.Delay(delay, cancellationToken);
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

            Console.WriteLine($"📺 Capturando monitor principal: {screenWidth}x{screenHeight} @ ({screenX}, {screenY})");

            // Calcular tamanho de saída (usar resolução real se não especificado)
            var outputWidth = targetWidth ?? screenWidth;
            var outputHeight = targetHeight ?? screenHeight;

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
                    var resized = new Bitmap(outputWidth, outputHeight);
                    using (var g = Graphics.FromImage(resized))
                    {
                        g.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
                        g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.HighQuality;
                        g.PixelOffsetMode = System.Drawing.Drawing2D.PixelOffsetMode.HighQuality;
                        g.DrawImage(bitmap, 0, 0, outputWidth, outputHeight);
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

    private byte[] BitmapToJpeg(Bitmap bitmap, int quality)
    {
        using (var ms = new MemoryStream())
        {
            var encoder = ImageCodecInfo.GetImageEncoders()
                .FirstOrDefault(c => c.FormatID == ImageFormat.Jpeg.Guid);
            
            if (encoder != null)
            {
                var encoderParams = new EncoderParameters(1);
                encoderParams.Param[0] = new EncoderParameter(Encoder.Quality, quality);
                
                bitmap.Save(ms, encoder, encoderParams);
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
