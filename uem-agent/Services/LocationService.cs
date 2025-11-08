using System.Net.Http;
using System.Text.Json;
using UEMAgent.Models;
using System.Management;

namespace UEMAgent.Services;

public class LocationService
{
    private readonly HttpClient _httpClient;
    private static LocationInfo? _cachedLocation = null;
    private static DateTime _lastLocationCheck = DateTime.MinValue;
    private static readonly TimeSpan _locationCacheTimeout = TimeSpan.FromMinutes(30); // Cache de 30 minutos

    public LocationService()
    {
        _httpClient = new HttpClient();
        _httpClient.Timeout = TimeSpan.FromSeconds(10);
    }

    public async Task<LocationInfo?> GetLocationAsync()
    {
        try
        {
            // Usar cache se ainda válido
            if (_cachedLocation != null && DateTime.Now - _lastLocationCheck < _locationCacheTimeout)
            {
                return _cachedLocation;
            }

            // Tentar múltiplas fontes de localização
            var location = await GetLocationFromMultipleSourcesAsync();
            
            if (location != null)
            {
                _cachedLocation = location;
                _lastLocationCheck = DateTime.Now;
            }

            return location;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"❌ Erro ao obter localização: {ex.Message}");
        }

        return _cachedLocation; // Retornar cache mesmo se expirado
    }

    private async Task<LocationInfo?> GetLocationFromMultipleSourcesAsync()
    {
        // 1. Tentar Windows Location API (mais preciso, se disponível)
        var windowsLocation = await GetWindowsLocationAsync();
        if (windowsLocation != null && windowsLocation.Accuracy < 1000) // Se precisão < 1km
        {
            return windowsLocation;
        }

        // 2. Tentar geolocalização por IP com múltiplas APIs (melhor precisão)
        var ipLocation = await GetLocationFromIPAsync();
        if (ipLocation != null)
        {
            // Se temos localização do Windows mas menos precisa, combinar dados
            if (windowsLocation != null)
            {
                // Usar IP se for mais preciso ou se Windows não tiver coordenadas
                if (ipLocation.Accuracy < windowsLocation.Accuracy || 
                    (windowsLocation.Latitude == null && ipLocation.Latitude != null))
                {
                    return ipLocation;
                }
            }
            return ipLocation;
        }

        // 3. Fallback para localização do Windows (mesmo que menos precisa)
        return windowsLocation;
    }

    private async Task<LocationInfo?> GetWindowsLocationAsync()
    {
        try
        {
            // Windows 10/11 tem Windows.Devices.Geolocation, mas requer UWP
            // Para aplicação desktop, vamos tentar via Registry/System Info
            // Nota: Windows Location API requer permissões especiais e UWP
            
            // Alternativa: Verificar timezone e usar como indicador de região
            var timezone = TimeZoneInfo.Local;
            // Isso não dá coordenadas, mas pode ajudar a validar localização por IP
            
            return null; // Windows Location API requer UWP, não disponível em desktop app
        }
        catch
        {
            return null;
        }
    }

    private async Task<LocationInfo?> GetLocationFromIPAsync()
    {
        // Lista de APIs de geolocalização por IP (ordenadas por qualidade/precisão)
        var apis = new[]
        {
            new { Url = "https://ip-api.com/json/?fields=status,message,lat,lon,city,country,region,timezone,isp,org,as,query", Name = "ip-api.com" },
            new { Url = "https://ipapi.co/json/", Name = "ipapi.co" },
            new { Url = "https://ipgeolocation.io/api/json/", Name = "ipgeolocation.io" },
            new { Url = "https://api.ipgeolocation.io/ipgeo?apiKey=free", Name = "ipgeolocation.io-free" }
        };

        foreach (var api in apis)
        {
            try
            {
                var response = await _httpClient.GetStringAsync(api.Url);
                var data = JsonSerializer.Deserialize<JsonElement>(response);

                // ip-api.com format
                if (data.TryGetProperty("status", out var status) && status.GetString() == "success")
                {
                    var lat = data.TryGetProperty("lat", out var latProp) ? latProp.GetDouble() : (double?)null;
                    var lon = data.TryGetProperty("lon", out var lonProp) ? lonProp.GetDouble() : (double?)null;
                    
                    if (lat.HasValue && lon.HasValue)
                    {
                        var city = data.TryGetProperty("city", out var cityProp) ? cityProp.GetString() : null;
                        var country = data.TryGetProperty("country", out var countryProp) ? countryProp.GetString() : null;
                        var region = data.TryGetProperty("region", out var regionProp) ? regionProp.GetString() : null;
                        var timezone = data.TryGetProperty("timezone", out var tzProp) ? tzProp.GetString() : null;
                        var isp = data.TryGetProperty("isp", out var ispProp) ? ispProp.GetString() : null;

                        // Calcular precisão baseada no tipo de conexão (ISP geralmente = menos preciso)
                        var accuracy = CalculateAccuracy(isp, city, region);

                        return new LocationInfo
                        {
                            Latitude = lat.Value,
                            Longitude = lon.Value,
                            Accuracy = accuracy,
                            Address = FormatAddress(city, region, country),
                            Source = "ip-api.com",
                            Timezone = timezone,
                            ISP = isp
                        };
                    }
                }
                // ipapi.co format
                else if (data.TryGetProperty("latitude", out var lat2) && data.TryGetProperty("longitude", out var lon2))
                {
                    var lat = lat2.GetDouble();
                    var lon = lon2.GetDouble();
                    var city = data.TryGetProperty("city", out var cityProp) ? cityProp.GetString() : null;
                    var country = data.TryGetProperty("country_name", out var countryProp) ? countryProp.GetString() : null;
                    var region = data.TryGetProperty("region", out var regionProp) ? regionProp.GetString() : null;

                    return new LocationInfo
                    {
                        Latitude = lat,
                        Longitude = lon,
                        Accuracy = 5000, // ~5km para ipapi.co
                        Address = FormatAddress(city, region, country),
                        Source = "ipapi.co"
                    };
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"⚠️ Erro ao consultar {api.Name}: {ex.Message}");
                continue; // Tentar próxima API
            }
        }

        return null;
    }

    private double CalculateAccuracy(string? isp, string? city, string? region)
    {
        // Precisão baseada em fatores:
        // - Se temos cidade: ~5-10km
        // - Se temos apenas região: ~20-50km
        // - Se temos apenas país: ~100-500km
        // - ISP mobile geralmente menos preciso que fixo

        if (!string.IsNullOrEmpty(city))
        {
            // Se ISP é mobile/celular, menos preciso
            if (isp != null && (isp.Contains("Mobile") || isp.Contains("Celular") || isp.Contains("3G") || isp.Contains("4G") || isp.Contains("5G")))
            {
                return 15000; // ~15km para mobile
            }
            return 8000; // ~8km para fixo com cidade
        }
        
        if (!string.IsNullOrEmpty(region))
        {
            return 30000; // ~30km para região
        }

        return 100000; // ~100km para país apenas
    }

    private string? FormatAddress(string? city, string? region, string? country)
    {
        var parts = new List<string>();
        if (!string.IsNullOrEmpty(city)) parts.Add(city);
        if (!string.IsNullOrEmpty(region)) parts.Add(region);
        if (!string.IsNullOrEmpty(country)) parts.Add(country);
        return parts.Count > 0 ? string.Join(", ", parts) : null;
    }
}

public class LocationInfo
{
    public double? Latitude { get; set; }
    public double? Longitude { get; set; }
    public double Accuracy { get; set; } // Em metros
    public string? Address { get; set; }
    public string? Source { get; set; } // Fonte da localização (ip-api.com, windows, etc.)
    public string? Timezone { get; set; }
    public string? ISP { get; set; }
    public DateTime? Timestamp { get; set; } = DateTime.Now;
}


