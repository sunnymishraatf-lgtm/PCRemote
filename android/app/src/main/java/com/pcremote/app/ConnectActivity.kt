package com.pcremote.app

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.nsd.NsdManager
import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast

/**
 * First screen: auto-discovers the PC on the local network
 * (same Wi-Fi, PC hotspot, USB tethering, Bluetooth tethering),
 * or pair via QR code / manual IP as fallback.
 */
class ConnectActivity : Activity() {

    private lateinit var savedList: LinearLayout
    private lateinit var savedLabel: TextView
    private lateinit var foundList: LinearLayout
    private lateinit var foundLabel: TextView
    private lateinit var foundStatus: TextView
    private lateinit var netBanner: TextView

    private var discovery: DiscoveryHelper? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_connect)

        savedList = findViewById(R.id.savedList)
        savedLabel = findViewById(R.id.savedLabel)
        foundList = findViewById(R.id.foundList)
        foundLabel = findViewById(R.id.foundLabel)
        foundStatus = findViewById(R.id.foundStatus)
        netBanner = findViewById(R.id.netBanner)

        findViewById<Button>(R.id.scanBtn).setOnClickListener { startScan() }

        val nsd = getSystemService(Context.NSD_SERVICE) as NsdManager
        discovery = DiscoveryHelper(nsd) { renderFound(it) }

        refreshSaved()
    }

    override fun onResume() {
        super.onResume()
        refreshSaved()
        updateNetBanner()
        foundStatus.text = "🔍 Scanning the local network…"
        foundStatus.visibility = View.VISIBLE
        discovery?.start()
    }

    override fun onPause() {
        super.onPause()
        discovery?.stop()
    }

    /** Shows what network the phone is on so a mismatch is obvious. */
    private fun updateNetBanner() {
        val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val net = cm.activeNetwork
        val caps = net?.let { cm.getNetworkCapabilities(it) }
        val label = when {
            caps == null -> "⚠️ No network connection"
            caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "📶 On Wi-Fi"
            caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "🔌 On wired/USB network"
            caps.hasTransport(NetworkCapabilities.TRANSPORT_BLUETOOTH) -> "🔵 On Bluetooth network"
            caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) ->
                "⚠️ On mobile data — switch to the same Wi-Fi / hotspot as the PC"
            else -> "📡 On a network"
        }
        netBanner.text = label
        netBanner.visibility = View.VISIBLE
    }

    private fun renderFound(list: List<DiscoveryHelper.Found>) {
        foundLabel.visibility = if (list.isEmpty()) View.GONE else View.VISIBLE
        foundStatus.visibility = if (list.isEmpty()) View.VISIBLE else View.GONE
        if (list.isEmpty()) foundStatus.text = "🔍 Scanning… (no PC found yet — is the server running?)"
        foundList.removeAllViews()
        for (f in list) {
            val b = Button(this).apply {
                text = "🖥️  ${f.name}\n${f.host}:${f.port} — tap to connect"
                textAlignment = View.TEXT_ALIGNMENT_VIEW_START
                setOnClickListener {
                    ServerStore.save(this@ConnectActivity, f.name, f.url)
                    refreshSaved()
                    openMain(f.url)
                }
            }
            foundList.addView(b, rowParams())
        }
    }

    private fun startScan() {
        if (checkSelfPermission(Manifest.permission.CAMERA)
            != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.CAMERA), REQ_CAMERA)
            return
        }
        startActivityForResult(Intent(this, QrScanActivity::class.java), REQ_SCAN)
    }

    override fun onRequestPermissionsResult(
        requestCode: Int, permissions: Array<out String>, grantResults: IntArray
    ) {
        if (requestCode == REQ_CAMERA &&
            grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            startActivityForResult(Intent(this, QrScanActivity::class.java), REQ_SCAN)
        } else if (requestCode == REQ_CAMERA) {
            Toast.makeText(this, "Camera permission is needed to scan the QR code",
                Toast.LENGTH_LONG).show()
        }
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == REQ_SCAN && resultCode == RESULT_OK) {
            val qr = data?.getStringExtra("qr")?.trim() ?: return
            // QR from the PC looks like: http://192.168.1.105:8080/connect?token=pair_...
            val url = if (qr.startsWith("http://") || qr.startsWith("https://")) qr
                      else "http://$qr:8080"
            val label = Regex("""https?://([^/:]+)""").find(url)?.groupValues?.get(1) ?: "PC"
            ServerStore.save(this, label, url)
            Toast.makeText(this, "Paired with $label", Toast.LENGTH_SHORT).show()
            openMain(url)
        }
    }

    private fun openMain(url: String) {
        startActivity(Intent(this, MainActivity::class.java).putExtra(MainActivity.EXTRA_URL, url))
    }

    private fun refreshSaved() {
        val servers = ServerStore.getAll(this)
        savedLabel.visibility = if (servers.isEmpty()) View.GONE else View.VISIBLE
        savedList.removeAllViews()
        for (s in servers) {
            val b = Button(this).apply {
                text = "🖥️  ${s.label}\n${s.url}"
                textAlignment = View.TEXT_ALIGNMENT_VIEW_START
                setOnClickListener { openMain(s.url) }
                setOnLongClickListener {
                    ServerStore.remove(this@ConnectActivity, s.url)
                    refreshSaved()
                    Toast.makeText(this@ConnectActivity, "Removed", Toast.LENGTH_SHORT).show()
                    true
                }
            }
            savedList.addView(b, rowParams())
        }
    }

    private fun rowParams() = LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT,
        LinearLayout.LayoutParams.WRAP_CONTENT
    ).apply { topMargin = 8 }

    companion object {
        private const val REQ_CAMERA = 100
        private const val REQ_SCAN = 101
    }
}
