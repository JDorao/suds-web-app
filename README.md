# SUDS Web App

Esta es la aplicación web del proyecto SUDS Madrid, generada con React y Firebase.

## 🚀 ¿Cómo usarla?

### 1. Sube este proyecto a GitHub
- Crea un nuevo repositorio (p.ej: `suds-app`)
- Sube todos estos archivos

### 2. Despliega en Vercel
- Ve a [https://vercel.com](https://vercel.com) y crea un proyecto nuevo
- Conecta tu cuenta de GitHub y elige este repositorio
- En la configuración de despliegue, añade las siguientes variables de entorno:

```
VITE_API_KEY=...
VITE_AUTH_DOMAIN=...
VITE_PROJECT_ID=...
VITE_STORAGE_BUCKET=...
VITE_MESSAGING_SENDER_ID=...
VITE_APP_ID=...
```

(usa el archivo `.env.example` como guía)

- Click en **Deploy**

### 3. Compartir la web
Una vez desplegada, Vercel te dará una URL pública que puedes compartir.

---

Esta app ya está lista para usarse con Firebase Authentication anónima + Firestore.