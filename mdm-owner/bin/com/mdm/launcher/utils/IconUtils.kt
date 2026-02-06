package com.mdm.launcher.utils

import android.content.Context
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.Drawable
import android.util.Base64
import android.util.Log
import java.io.ByteArrayOutputStream

object IconUtils {
    
    fun convertDrawableToBase64(drawable: Drawable?): String? {
        if (drawable == null) return null
        
        return try {
            val bitmap = drawableToBitmap(drawable)
            val outputStream = ByteArrayOutputStream()
            bitmap.compress(Bitmap.CompressFormat.PNG, 100, outputStream)
            val byteArray = outputStream.toByteArray()
            Base64.encodeToString(byteArray, Base64.DEFAULT)
        } catch (e: Exception) {
            Log.e("IconUtils", "Erro ao converter ícone para Base64", e)
            null
        }
    }
    
    private fun drawableToBitmap(drawable: Drawable): Bitmap {
        if (drawable is BitmapDrawable) {
            drawable.bitmap?.let { return it }
        }
        
        val width = if (drawable.intrinsicWidth > 0) drawable.intrinsicWidth else 512
        val height = if (drawable.intrinsicHeight > 0) drawable.intrinsicHeight else 512
        
        val bitmap = Bitmap.createBitmap(
            width,
            height,
            Bitmap.Config.ARGB_8888
        )
        val canvas = Canvas(bitmap)
        drawable.setBounds(0, 0, canvas.width, canvas.height)
        drawable.draw(canvas)
        return bitmap
    }
    
    fun getAppIcon(context: Context, packageName: String): Drawable? {
        return try {
            val packageManager = context.packageManager
            val appInfo = packageManager.getApplicationInfo(packageName, 0)
            packageManager.getApplicationIcon(appInfo)
        } catch (e: Exception) {
            Log.e("IconUtils", "Erro ao obter ícone do app: $packageName", e)
            null
        }
    }
}
