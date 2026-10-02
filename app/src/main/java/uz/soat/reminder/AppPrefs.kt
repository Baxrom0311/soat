package uz.soat.reminder

import android.content.Context

object AppPrefs {
    private const val PREFS_NAME = "app_prefs"
    private const val KEY_TOKEN = "auth_token"
    private const val KEY_SERVER_HOST = "server_host"
    private const val KEY_SERVER_PORT = "server_port"
    private const val KEY_SCHEME = "server_scheme"
    private const val KEY_NURSE_NAME = "nurse_name"

    private fun prefs(context: Context) =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun getToken(context: Context): String? =
        prefs(context).getString(KEY_TOKEN, null)

    /**
     * Token va u bilan birga kelgan ism bitta joyda saqlanadi.
     *
     * Ism tokenning o'zidan olinadi, login javobidan emas: soatga token ikki
     * yo'l bilan keladi — soatda kirish va telefondan Bluetooth orqali — va
     * ikkinchisida login javobi umuman yo'q. Tokenning ichidan olinsa,
     * ikkalasi ham bir xil ishlaydi va ikki joy bir-biridan ayrilib keta
     * olmaydi.
     */
    fun setToken(context: Context, token: String?) {
        prefs(context).edit()
            .putString(KEY_TOKEN, token)
            .putString(KEY_NURSE_NAME, WatchToken.nameOf(token))
            .apply()
    }

    fun getServerHost(context: Context, default: String): String =
        prefs(context).getString(KEY_SERVER_HOST, default) ?: default

    fun getServerPort(context: Context, default: Int): Int =
        prefs(context).getInt(KEY_SERVER_PORT, default)

    fun setServer(context: Context, host: String, port: Int) {
        prefs(context).edit()
            .putString(KEY_SERVER_HOST, host)
            .putInt(KEY_SERVER_PORT, port)
            .apply()
    }

    fun getScheme(context: Context, default: String): String =
        prefs(context).getString(KEY_SCHEME, default) ?: default

    fun setScheme(context: Context, scheme: String) {
        prefs(context).edit().putString(KEY_SCHEME, scheme).apply()
    }

    /** Soatda kim kirganini ko'rsatish uchun. Token bilan birga tozalanadi:
     *  tokensiz ism — kimdir hali ham kirgan degan yolg'on taassurot. */
    fun getNurseName(context: Context): String? =
        prefs(context).getString(KEY_NURSE_NAME, null)

    fun getLastEmail(context: Context): String? =
        prefs(context).getString("last_email", null)

    fun setLastEmail(context: Context, email: String?) {
        prefs(context).edit().putString("last_email", email).apply()
    }
}
