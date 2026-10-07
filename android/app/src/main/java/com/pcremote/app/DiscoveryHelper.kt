package com.pcremote.app

import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.util.Log

/**
 * Finds PC Remote servers on the local IP network — same Wi-Fi, PC hotspot,
 * USB tethering, or Bluetooth tethering (all of these are plain IP networks,
 * so one discovery mechanism covers them all).
 *
 * The PC server advertises itself over mDNS (_http._tcp) with a TXT marker
 * app=pc-remote; anything else (printers, routers…) is ignored.
 */
class DiscoveryHelper(
    private val nsd: NsdManager,
    private val onUpdate: (List<Found>) -> Unit
) {
    data class Found(val name: String, val host: String, val port: Int) {
        val url: String get() = "http://$host:$port"
    }

    private val found = LinkedHashMap<String, Found>()
    private var discovering = false

    private val discoveryListener = object : NsdManager.DiscoveryListener {
        override fun onDiscoveryStarted(regType: String) {}
        override fun onDiscoveryStopped(regType: String) {}
        override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) {
            Log.w("PCRemote", "NSD start failed: $errorCode")
        }
        override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) {}
        override fun onServiceFound(service: NsdServiceInfo) {
            try {
                nsd.resolveService(service, resolveListener)
            } catch (e: Exception) {
                Log.w("PCRemote", "resolve failed", e)
            }
        }
        override fun onServiceLost(service: NsdServiceInfo) {
            // Remove by host+port match; the lost name may carry a "(2)" suffix.
            val doomed = found.values.firstOrNull { it.name == service.serviceName }
            if (doomed != null) {
                found.remove(doomed.name)
                push()
            }
        }
    }

    private val resolveListener = object : NsdManager.ResolveListener {
        override fun onResolveFailed(serviceInfo: NsdServiceInfo, errorCode: Int) {}
        override fun onServiceResolved(info: NsdServiceInfo) {
            // TXT marker check (case-insensitive key, UTF-8 value).
            val isOurs = info.attributes.entries.any { (k, v) ->
                k.equals("app", ignoreCase = true) && v.toString(Charsets.UTF_8) == "pc-remote"
            }
            if (!isOurs) return
            val host = info.host?.hostAddress ?: return
            val port = info.port
            if (port <= 0) return
            val label = info.serviceName.removePrefix("PC Remote ").trim()
                .ifEmpty { info.serviceName }
            found[info.serviceName] = Found(label.ifEmpty { host }, host, port)
            push()
        }
    }

    private fun push() = onUpdate(found.values.sortedBy { it.name })

    fun start() {
        if (discovering) return
        discovering = true
        try {
            nsd.discoverServices("_http._tcp.", NsdManager.PROTOCOL_DNS_SD, discoveryListener)
        } catch (e: Exception) {
            discovering = false
            Log.w("PCRemote", "NSD discover failed", e)
        }
    }

    fun stop() {
        if (!discovering) return
        discovering = false
        try { nsd.stopServiceDiscovery(discoveryListener) } catch (_: Exception) {}
    }

    fun clear() {
        found.clear()
        push()
    }
}
