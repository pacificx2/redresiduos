/* =====================================================================
   Conexión con Supabase.

   Estas dos constantes son públicas por diseño: viajan dentro de la
   página y cualquiera puede leerlas. No son una contraseña.

   Lo que se puede hacer con ellas lo decide el esquema, no el secreto:
   llamar a las tres funciones de inserción y leer las tres vistas ya
   filtradas. Nada más. Ver backend/README.md.

   La que nunca debe salir de Supabase es la `service_role key`.

   Están aquí, en un archivo aparte, porque las usan cuatro páginas
   (index, directorio, datos y moderar) y un día habrá que rotarlas.
   ===================================================================== */
var SUPABASE_URL = 'https://wcszdshiklioybirgeuh.supabase.co';
var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indjc3pkc2hpa2xpb3liaXJnZXVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc1ODE5NjIsImV4cCI6MjEwMzE1Nzk2Mn0.6nX4m8sRYGs8-tDOYVrvr0emzQlXMXxaZDQ1JG248vs';
