# Patch: Desbloquear com um Toque (Remover Deslizar e Logo)

## Objetivo
1. Remover a necessidade de deslizar para desbloquear
2. O dispositivo desbloqueará com **qualquer toque** na tela
3. **Remover a logo/ícone da tela de bloqueio**

## Arquivos a Modificar
```
mdm-owner/app/src/main/java/com/mdm/launcher/LockScreenActivity.kt
mdm-owner/app/src/main/res/layout/activity_lock_screen.xml
```

## Mudança 1: Remover Logo do XML Layout

Abra `activity_lock_screen.xml` e remova as linhas com logo/ícone:

**Procure por:**
```xml
<ImageView
    android:id="@+id/lock_icon"
    android:layout_width="100dp"
    android:layout_height="100dp"
    android:src="@drawable/ic_lock"
    android:contentDescription="Lock Icon" />
```

**Remova essas linhas completamente.**

Também procure por qualquer `<ImageView>` ou `<ImageButton>` com logo/cadeado/ícone e remova.

### Resultado esperado do XML:
```xml
<LinearLayout
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:orientation="vertical"
    android:padding="20dp">
    
    <!-- Apenas TextViews e EditText/Button - SEM ImageView de logo -->
    
    <TextView
        android:id="@+id/lock_title"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:text="Dispositivo Bloqueado"
        android:textSize="24sp"
        android:textColor="@android:color/white" />
    
    <TextView
        android:id="@+id/lock_message"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:text="Peça para seu líder desbloquear"
        android:textSize="16sp"
        android:textColor="@android:color/white" />
    
    <EditText
        android:id="@+id/lock_password_input"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:hint="Digite a senha"
        android:inputType="number"
        android:textSize="18sp" />
    
    <Button
        android:id="@+id/lock_unlock_btn"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:text="Desbloquear"
        android:layout_marginTop="20dp" />
</LinearLayout>
```

## Mudança 2: Remover Logo do Kotlin Code

Abra `LockScreenActivity.kt` e procure por qualquer linha que defina logo:

**Remova linhas como:**
```kotlin
val lockIcon = findViewById<ImageView>(R.id.lock_icon)
// ...
lockIcon.setImageResource(R.drawable.ic_lock)
```

## Mudança 3: Modificar onTouchEvent para Desbloquear com Um Clique

### Adicionar campo na classe
