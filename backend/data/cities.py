# Master cities data — SINGLE SOURCE OF TRUTH
# Used by: backend seed endpoint
# Format: {country_code, name, slug, state, timezone, active}

CITIES = [
    # Mexico (MX)
    {"country_code": "MX", "name": "Ciudad de México", "slug": "cdmx", "state": "CDMX", "timezone": "America/Mexico_City"},
    {"country_code": "MX", "name": "Guadalajara", "slug": "guadalajara", "state": "Jalisco", "timezone": "America/Mexico_City"},
    {"country_code": "MX", "name": "Monterrey", "slug": "monterrey", "state": "Nuevo León", "timezone": "America/Monterrey"},
    {"country_code": "MX", "name": "Puebla", "slug": "puebla", "state": "Puebla", "timezone": "America/Mexico_City"},
    {"country_code": "MX", "name": "Tijuana", "slug": "tijuana", "state": "Baja California", "timezone": "America/Tijuana"},
    {"country_code": "MX", "name": "León", "slug": "leon", "state": "Guanajuato", "timezone": "America/Mexico_City"},
    {"country_code": "MX", "name": "Cancún", "slug": "cancun", "state": "Quintana Roo", "timezone": "America/Cancun"},
    {"country_code": "MX", "name": "Mérida", "slug": "merida", "state": "Yucatán", "timezone": "America/Merida"},
    {"country_code": "MX", "name": "Querétaro", "slug": "queretaro", "state": "Querétaro", "timezone": "America/Mexico_City"},
    {"country_code": "MX", "name": "San Luis Potosí", "slug": "san-luis-potosi", "state": "San Luis Potosí", "timezone": "America/Mexico_City"},
    {"country_code": "MX", "name": "Aguascalientes", "slug": "aguascalientes", "state": "Aguascalientes", "timezone": "America/Mexico_City"},
    {"country_code": "MX", "name": "Hermosillo", "slug": "hermosillo", "state": "Sonora", "timezone": "America/Hermosillo"},
    {"country_code": "MX", "name": "Chihuahua", "slug": "chihuahua", "state": "Chihuahua", "timezone": "America/Chihuahua"},
    {"country_code": "MX", "name": "Saltillo", "slug": "saltillo", "state": "Coahuila", "timezone": "America/Monterrey"},
    {"country_code": "MX", "name": "Morelia", "slug": "morelia", "state": "Michoacán", "timezone": "America/Mexico_City"},
    {"country_code": "MX", "name": "Villahermosa", "slug": "villahermosa", "state": "Tabasco", "timezone": "America/Mexico_City"},
    {"country_code": "MX", "name": "Toluca", "slug": "toluca", "state": "Estado de México", "timezone": "America/Mexico_City"},
    {"country_code": "MX", "name": "Tuxtla Gutiérrez", "slug": "tuxtla-gutierrez", "state": "Chiapas", "timezone": "America/Mexico_City"},
    {"country_code": "MX", "name": "Oaxaca", "slug": "oaxaca", "state": "Oaxaca", "timezone": "America/Mexico_City"},
    {"country_code": "MX", "name": "Veracruz", "slug": "veracruz", "state": "Veracruz", "timezone": "America/Mexico_City"},
    # United States (US)
    {"country_code": "US", "name": "New York", "slug": "new-york", "state": "New York", "timezone": "America/New_York"},
    {"country_code": "US", "name": "Los Angeles", "slug": "los-angeles", "state": "California", "timezone": "America/Los_Angeles"},
    {"country_code": "US", "name": "Chicago", "slug": "chicago", "state": "Illinois", "timezone": "America/Chicago"},
    {"country_code": "US", "name": "Houston", "slug": "houston", "state": "Texas", "timezone": "America/Chicago"},
    {"country_code": "US", "name": "Phoenix", "slug": "phoenix", "state": "Arizona", "timezone": "America/Phoenix"},
    {"country_code": "US", "name": "San Antonio", "slug": "san-antonio", "state": "Texas", "timezone": "America/Chicago"},
    {"country_code": "US", "name": "Dallas", "slug": "dallas", "state": "Texas", "timezone": "America/Chicago"},
    {"country_code": "US", "name": "Miami", "slug": "miami", "state": "Florida", "timezone": "America/New_York"},
    {"country_code": "US", "name": "San Diego", "slug": "san-diego", "state": "California", "timezone": "America/Los_Angeles"},
    {"country_code": "US", "name": "San Francisco", "slug": "san-francisco", "state": "California", "timezone": "America/Los_Angeles"},
    # Colombia (CO)
    {"country_code": "CO", "name": "Bogotá", "slug": "bogota", "state": "Cundinamarca", "timezone": "America/Bogota"},
    {"country_code": "CO", "name": "Medellín", "slug": "medellin", "state": "Antioquia", "timezone": "America/Bogota"},
    {"country_code": "CO", "name": "Cali", "slug": "cali", "state": "Valle del Cauca", "timezone": "America/Bogota"},
    {"country_code": "CO", "name": "Barranquilla", "slug": "barranquilla", "state": "Atlántico", "timezone": "America/Bogota"},
    {"country_code": "CO", "name": "Cartagena", "slug": "cartagena", "state": "Bolívar", "timezone": "America/Bogota"},
    {"country_code": "CO", "name": "Bucaramanga", "slug": "bucaramanga", "state": "Santander", "timezone": "America/Bogota"},
    {"country_code": "CO", "name": "Pereira", "slug": "pereira", "state": "Risaralda", "timezone": "America/Bogota"},
    {"country_code": "CO", "name": "Santa Marta", "slug": "santa-marta", "state": "Magdalena", "timezone": "America/Bogota"},
    {"country_code": "CO", "name": "Manizales", "slug": "manizales", "state": "Caldas", "timezone": "America/Bogota"},
    {"country_code": "CO", "name": "Cúcuta", "slug": "cucuta", "state": "Norte de Santander", "timezone": "America/Bogota"},
    # Argentina (AR)
    {"country_code": "AR", "name": "Buenos Aires", "slug": "buenos-aires", "state": "Buenos Aires", "timezone": "America/Argentina/Buenos_Aires"},
    {"country_code": "AR", "name": "Córdoba", "slug": "cordoba-ar", "state": "Córdoba", "timezone": "America/Argentina/Cordoba"},
    {"country_code": "AR", "name": "Rosario", "slug": "rosario", "state": "Santa Fe", "timezone": "America/Argentina/Buenos_Aires"},
    {"country_code": "AR", "name": "Mendoza", "slug": "mendoza", "state": "Mendoza", "timezone": "America/Argentina/Mendoza"},
    {"country_code": "AR", "name": "San Miguel de Tucumán", "slug": "tucuman", "state": "Tucumán", "timezone": "America/Argentina/Tucuman"},
    {"country_code": "AR", "name": "La Plata", "slug": "la-plata", "state": "Buenos Aires", "timezone": "America/Argentina/Buenos_Aires"},
    {"country_code": "AR", "name": "Mar del Plata", "slug": "mar-del-plata", "state": "Buenos Aires", "timezone": "America/Argentina/Buenos_Aires"},
    {"country_code": "AR", "name": "Salta", "slug": "salta", "state": "Salta", "timezone": "America/Argentina/Salta"},
    # Chile (CL)
    {"country_code": "CL", "name": "Santiago", "slug": "santiago", "state": "Región Metropolitana", "timezone": "America/Santiago"},
    {"country_code": "CL", "name": "Valparaíso", "slug": "valparaiso", "state": "Valparaíso", "timezone": "America/Santiago"},
    {"country_code": "CL", "name": "Concepción", "slug": "concepcion", "state": "Biobío", "timezone": "America/Santiago"},
    {"country_code": "CL", "name": "Viña del Mar", "slug": "vina-del-mar", "state": "Valparaíso", "timezone": "America/Santiago"},
    {"country_code": "CL", "name": "Antofagasta", "slug": "antofagasta", "state": "Antofagasta", "timezone": "America/Santiago"},
    {"country_code": "CL", "name": "Temuco", "slug": "temuco", "state": "Araucanía", "timezone": "America/Santiago"},
    # Peru (PE)
    {"country_code": "PE", "name": "Lima", "slug": "lima", "state": "Lima", "timezone": "America/Lima"},
    {"country_code": "PE", "name": "Arequipa", "slug": "arequipa", "state": "Arequipa", "timezone": "America/Lima"},
    {"country_code": "PE", "name": "Trujillo", "slug": "trujillo", "state": "La Libertad", "timezone": "America/Lima"},
    {"country_code": "PE", "name": "Chiclayo", "slug": "chiclayo", "state": "Lambayeque", "timezone": "America/Lima"},
    {"country_code": "PE", "name": "Cusco", "slug": "cusco", "state": "Cusco", "timezone": "America/Lima"},
    {"country_code": "PE", "name": "Piura", "slug": "piura", "state": "Piura", "timezone": "America/Lima"},
    # Ecuador (EC)
    {"country_code": "EC", "name": "Quito", "slug": "quito", "state": "Pichincha", "timezone": "America/Guayaquil"},
    {"country_code": "EC", "name": "Guayaquil", "slug": "guayaquil", "state": "Guayas", "timezone": "America/Guayaquil"},
    {"country_code": "EC", "name": "Cuenca", "slug": "cuenca", "state": "Azuay", "timezone": "America/Guayaquil"},
    {"country_code": "EC", "name": "Manta", "slug": "manta", "state": "Manabí", "timezone": "America/Guayaquil"},
    {"country_code": "EC", "name": "Ambato", "slug": "ambato", "state": "Tungurahua", "timezone": "America/Guayaquil"},
    # Spain (ES)
    {"country_code": "ES", "name": "Madrid", "slug": "madrid", "state": "Comunidad de Madrid", "timezone": "Europe/Madrid"},
    {"country_code": "ES", "name": "Barcelona", "slug": "barcelona", "state": "Cataluña", "timezone": "Europe/Madrid"},
    {"country_code": "ES", "name": "Valencia", "slug": "valencia", "state": "Comunidad Valenciana", "timezone": "Europe/Madrid"},
    {"country_code": "ES", "name": "Sevilla", "slug": "sevilla", "state": "Andalucía", "timezone": "Europe/Madrid"},
    {"country_code": "ES", "name": "Bilbao", "slug": "bilbao", "state": "País Vasco", "timezone": "Europe/Madrid"},
    {"country_code": "ES", "name": "Málaga", "slug": "malaga", "state": "Andalucía", "timezone": "Europe/Madrid"},
    {"country_code": "ES", "name": "Zaragoza", "slug": "zaragoza", "state": "Aragón", "timezone": "Europe/Madrid"},
    {"country_code": "ES", "name": "Palma de Mallorca", "slug": "palma", "state": "Islas Baleares", "timezone": "Europe/Madrid"},
    # Guatemala (GT)
    {"country_code": "GT", "name": "Ciudad de Guatemala", "slug": "guatemala-city", "state": "Guatemala", "timezone": "America/Guatemala"},
    {"country_code": "GT", "name": "Quetzaltenango", "slug": "quetzaltenango", "state": "Quetzaltenango", "timezone": "America/Guatemala"},
    {"country_code": "GT", "name": "Escuintla", "slug": "escuintla", "state": "Escuintla", "timezone": "America/Guatemala"},
    {"country_code": "GT", "name": "Mixco", "slug": "mixco", "state": "Guatemala", "timezone": "America/Guatemala"},
    # El Salvador (SV)
    {"country_code": "SV", "name": "San Salvador", "slug": "san-salvador", "state": "San Salvador", "timezone": "America/El_Salvador"},
    {"country_code": "SV", "name": "Santa Ana", "slug": "santa-ana-sv", "state": "Santa Ana", "timezone": "America/El_Salvador"},
    {"country_code": "SV", "name": "San Miguel", "slug": "san-miguel-sv", "state": "San Miguel", "timezone": "America/El_Salvador"},
    # Honduras (HN)
    {"country_code": "HN", "name": "Tegucigalpa", "slug": "tegucigalpa", "state": "Francisco Morazán", "timezone": "America/Tegucigalpa"},
    {"country_code": "HN", "name": "San Pedro Sula", "slug": "san-pedro-sula", "state": "Cortés", "timezone": "America/Tegucigalpa"},
    {"country_code": "HN", "name": "La Ceiba", "slug": "la-ceiba", "state": "Atlántida", "timezone": "America/Tegucigalpa"},
    # Costa Rica (CR)
    {"country_code": "CR", "name": "San José", "slug": "san-jose-cr", "state": "San José", "timezone": "America/Costa_Rica"},
    {"country_code": "CR", "name": "Alajuela", "slug": "alajuela", "state": "Alajuela", "timezone": "America/Costa_Rica"},
    {"country_code": "CR", "name": "Cartago", "slug": "cartago", "state": "Cartago", "timezone": "America/Costa_Rica"},
    {"country_code": "CR", "name": "Heredia", "slug": "heredia", "state": "Heredia", "timezone": "America/Costa_Rica"},
    # Panama (PA)
    {"country_code": "PA", "name": "Ciudad de Panamá", "slug": "panama-city", "state": "Panamá", "timezone": "America/Panama"},
    {"country_code": "PA", "name": "Colón", "slug": "colon", "state": "Colón", "timezone": "America/Panama"},
    {"country_code": "PA", "name": "David", "slug": "david-pa", "state": "Chiriquí", "timezone": "America/Panama"},
    # Venezuela (VE)
    {"country_code": "VE", "name": "Caracas", "slug": "caracas", "state": "Distrito Capital", "timezone": "America/Caracas"},
    {"country_code": "VE", "name": "Maracaibo", "slug": "maracaibo", "state": "Zulia", "timezone": "America/Caracas"},
    {"country_code": "VE", "name": "Valencia", "slug": "valencia-ve", "state": "Carabobo", "timezone": "America/Caracas"},
    {"country_code": "VE", "name": "Barquisimeto", "slug": "barquisimeto", "state": "Lara", "timezone": "America/Caracas"},
    {"country_code": "VE", "name": "Mérida", "slug": "merida-ve", "state": "Mérida", "timezone": "America/Caracas"},
    # Brazil (BR)
    {"country_code": "BR", "name": "São Paulo", "slug": "sao-paulo", "state": "São Paulo", "timezone": "America/Sao_Paulo"},
    {"country_code": "BR", "name": "Rio de Janeiro", "slug": "rio-de-janeiro", "state": "Rio de Janeiro", "timezone": "America/Sao_Paulo"},
    {"country_code": "BR", "name": "Brasília", "slug": "brasilia", "state": "Distrito Federal", "timezone": "America/Sao_Paulo"},
    {"country_code": "BR", "name": "Salvador", "slug": "salvador-br", "state": "Bahia", "timezone": "America/Bahia"},
    {"country_code": "BR", "name": "Fortaleza", "slug": "fortaleza", "state": "Ceará", "timezone": "America/Fortaleza"},
    {"country_code": "BR", "name": "Belo Horizonte", "slug": "belo-horizonte", "state": "Minas Gerais", "timezone": "America/Sao_Paulo"},
    {"country_code": "BR", "name": "Curitiba", "slug": "curitiba", "state": "Paraná", "timezone": "America/Sao_Paulo"},
    {"country_code": "BR", "name": "Recife", "slug": "recife", "state": "Pernambuco", "timezone": "America/Recife"},
    # Dominican Republic (DO)
    {"country_code": "DO", "name": "Santo Domingo", "slug": "santo-domingo", "state": "Distrito Nacional", "timezone": "America/Santo_Domingo"},
    {"country_code": "DO", "name": "Santiago de los Caballeros", "slug": "santiago-do", "state": "Santiago", "timezone": "America/Santo_Domingo"},
    {"country_code": "DO", "name": "Punta Cana", "slug": "punta-cana", "state": "La Altagracia", "timezone": "America/Santo_Domingo"},
    # Cuba (CU)
    {"country_code": "CU", "name": "La Habana", "slug": "la-habana", "state": "La Habana", "timezone": "America/Havana"},
    {"country_code": "CU", "name": "Santiago de Cuba", "slug": "santiago-cu", "state": "Santiago de Cuba", "timezone": "America/Havana"},
    # Paraguay (PY)
    {"country_code": "PY", "name": "Asunción", "slug": "asuncion", "state": "Asunción", "timezone": "America/Asuncion"},
    {"country_code": "PY", "name": "Ciudad del Este", "slug": "ciudad-del-este", "state": "Alto Paraná", "timezone": "America/Asuncion"},
    # Uruguay (UY)
    {"country_code": "UY", "name": "Montevideo", "slug": "montevideo", "state": "Montevideo", "timezone": "America/Montevideo"},
    {"country_code": "UY", "name": "Punta del Este", "slug": "punta-del-este", "state": "Maldonado", "timezone": "America/Montevideo"},
    # Bolivia (BO)
    {"country_code": "BO", "name": "La Paz", "slug": "la-paz", "state": "La Paz", "timezone": "America/La_Paz"},
    {"country_code": "BO", "name": "Santa Cruz", "slug": "santa-cruz-bo", "state": "Santa Cruz", "timezone": "America/La_Paz"},
    {"country_code": "BO", "name": "Cochabamba", "slug": "cochabamba", "state": "Cochabamba", "timezone": "America/La_Paz"},
    # Nicaragua (NI)
    {"country_code": "NI", "name": "Managua", "slug": "managua", "state": "Managua", "timezone": "America/Managua"},
    {"country_code": "NI", "name": "León", "slug": "leon-ni", "state": "León", "timezone": "America/Managua"},
    # Canada (CA)
    {"country_code": "CA", "name": "Toronto", "slug": "toronto", "state": "Ontario", "timezone": "America/Toronto"},
    {"country_code": "CA", "name": "Montreal", "slug": "montreal", "state": "Quebec", "timezone": "America/Toronto"},
    {"country_code": "CA", "name": "Vancouver", "slug": "vancouver", "state": "British Columbia", "timezone": "America/Vancouver"},
    {"country_code": "CA", "name": "Calgary", "slug": "calgary", "state": "Alberta", "timezone": "America/Edmonton"},
    {"country_code": "CA", "name": "Ottawa", "slug": "ottawa", "state": "Ontario", "timezone": "America/Toronto"},
]

# Add default fields to all cities
for city in CITIES:
    city.setdefault("active", True)
    city.setdefault("business_count", 0)
