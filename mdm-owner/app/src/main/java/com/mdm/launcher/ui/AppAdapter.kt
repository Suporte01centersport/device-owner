package com.mdm.launcher.ui

import android.content.Intent
import android.content.pm.PackageManager
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.mdm.launcher.R
import com.mdm.launcher.data.AppInfo

class AppAdapter(
    private var apps: List<AppInfo>,
    private val onAppClick: (AppInfo) -> Unit
) : RecyclerView.Adapter<AppAdapter.AppViewHolder>() {
    
    class AppViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        val appIcon: ImageView = itemView.findViewById(R.id.app_icon)
        
        // Cache para otimização
        private var currentApp: AppInfo? = null
        
        fun bind(app: AppInfo, onAppClick: (AppInfo) -> Unit) {
            currentApp = app
            
            // Definir ícone do app com cache
            if (app.icon != null) {
                appIcon.setImageDrawable(app.icon)
            } else {
                appIcon.setImageResource(R.drawable.ic_android)
            }
            
            // Configurar clique
            itemView.setOnClickListener {
                onAppClick(app)
            }
        }
    }
    
    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): AppViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_app, parent, false)
        return AppViewHolder(view)
    }
    
    override fun onBindViewHolder(holder: AppViewHolder, position: Int) {
        val app = apps[position]
        holder.bind(app, onAppClick)
    }
    
    override fun getItemCount(): Int = apps.size
    
    // Método para atualizar lista de apps
    fun updateApps(newApps: List<AppInfo>) {
        apps = newApps
        notifyDataSetChanged()
    }
    
    // Otimização: notifyItemChanged apenas para mudanças específicas
    fun updateApp(position: Int, app: AppInfo) {
        if (position in 0 until apps.size) {
            apps = apps.toMutableList().apply { set(position, app) }
            notifyItemChanged(position)
        }
    }
}
