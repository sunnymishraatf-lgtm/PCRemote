package com.pcremote.app

import android.app.Activity
import android.content.Intent
import android.hardware.Camera
import android.os.Bundle
import android.view.SurfaceHolder
import android.view.SurfaceView
import android.view.View
import android.widget.Button
import android.widget.Toast
import com.google.zxing.BinaryBitmap
import com.google.zxing.PlanarYUVLuminanceSource
import com.google.zxing.common.HybridBinarizer
import com.google.zxing.qrcode.QRCodeReader

/**
 * QR scanner using the framework Camera API + ZXing core (no Play Services).
 * Returns the decoded text in the "qr" extra.
 */
class QrScanActivity : Activity(), SurfaceHolder.Callback, Camera.PreviewCallback {

    private lateinit var surfaceView: SurfaceView
    private var camera: Camera? = null
    private val reader = QRCodeReader()
    private var lastDecode = 0L
    private var done = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_qrscan)
        surfaceView = findViewById(R.id.preview)
        surfaceView.holder.addCallback(this)
        findViewById<Button>(R.id.cancelBtn).setOnClickListener { finish() }
    }

    override fun surfaceCreated(holder: SurfaceHolder) {
        try {
            val cam = Camera.open()
            camera = cam
            val params = cam.parameters
            val focusModes = params.supportedFocusModes
            if (focusModes != null) {
                when {
                    focusModes.contains(Camera.Parameters.FOCUS_MODE_CONTINUOUS_PICTURE) ->
                        params.focusMode = Camera.Parameters.FOCUS_MODE_CONTINUOUS_PICTURE
                    focusModes.contains(Camera.Parameters.FOCUS_MODE_AUTO) ->
                        params.focusMode = Camera.Parameters.FOCUS_MODE_AUTO
                }
                try { cam.parameters = params } catch (_: Exception) { }
            }
            cam.setPreviewDisplay(holder)
            cam.setPreviewCallback(this)
            cam.startPreview()
        } catch (e: Exception) {
            Toast.makeText(this, "Could not open the camera: ${e.message}",
                Toast.LENGTH_LONG).show()
            finish()
        }
    }

    override fun surfaceChanged(holder: SurfaceHolder, format: Int, width: Int, height: Int) {}
    override fun surfaceDestroyed(holder: SurfaceHolder) { releaseCamera() }

    override fun onPause() {
        super.onPause()
        releaseCamera()
    }

    private fun releaseCamera() {
        try {
            camera?.setPreviewCallback(null)
            camera?.stopPreview()
            camera?.release()
        } catch (_: Exception) { }
        camera = null
    }

    override fun onPreviewFrame(data: ByteArray, cam: Camera) {
        if (done) return
        val now = System.currentTimeMillis()
        if (now - lastDecode < 350) return // throttle: decode ~3x/sec
        lastDecode = now
        val params = try { cam.parameters.previewSize } catch (_: Exception) { return }
        try {
            val source = PlanarYUVLuminanceSource(
                data, params.width, params.height, 0, 0, params.width, params.height, false)
            val result = reader.decode(BinaryBitmap(HybridBinarizer(source)))
            val text = result.text?.trim()
            if (!text.isNullOrEmpty()) {
                done = true
                setResult(RESULT_OK, Intent().putExtra("qr", text))
                finish()
            }
        } catch (_: Exception) {
            // no QR in this frame — keep scanning
        } finally {
            try { reader.reset() } catch (_: Exception) { }
        }
    }
}
