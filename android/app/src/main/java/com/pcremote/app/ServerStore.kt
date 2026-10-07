package com.pcremote.app

import android.content.Context

/** Recently used PC servers, kept on-device. */
object ServerStore {
    private const val PREF = "pc_remote_servers"
    private const val KEY = "servers"

    data class Server(val label: String, val url: String)

    fun getAll(ctx: Context): MutableList<Server> {
        val set = ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE)
            .getStringSet(KEY, emptySet()) ?: emptySet()
        return set.mapNotNull { s ->
            val i = s.indexOf('|')
            if (i > 0) Server(s.substring(0, i), s.substring(i + 1)) else null
        }.toMutableList()
    }

    fun save(ctx: Context, label: String, url: String) {
        val all = getAll(ctx)
        all.removeAll { it.url == url }
        all.add(0, Server(label, url))
        val trimmed = all.take(10)
        ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE).edit()
            .putStringSet(KEY, trimmed.map { "${it.label}|${it.url}" }.toSet())
            .apply()
    }

    fun remove(ctx: Context, url: String) {
        val all = getAll(ctx)
        all.removeAll { it.url == url }
        ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE).edit()
            .putStringSet(KEY, all.map { "${it.label}|${it.url}" }.toSet())
            .apply()
    }
}
