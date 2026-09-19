package com.cmnewstn.playappupdate

import android.app.Activity
import com.google.android.play.core.appupdate.AppUpdateInfo
import com.google.android.play.core.appupdate.AppUpdateManager
import com.google.android.play.core.appupdate.AppUpdateManagerFactory
import com.google.android.play.core.appupdate.AppUpdateOptions
import com.google.android.play.core.install.InstallState
import com.google.android.play.core.install.InstallStateUpdatedListener
import com.google.android.play.core.install.model.AppUpdateType
import com.google.android.play.core.install.model.InstallStatus
import com.google.android.play.core.install.model.UpdateAvailability
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

private const val EVENT_INSTALL_STATE = "onInstallStateChange"

/**
 * Thin bridge over Google Play's official In-App Updates API (Play Core `app-update`).
 * All update policy (flexible vs immediate, when to prompt) lives in TypeScript; this module
 * only reports what Google Play says and forwards the user's choices. It never downloads or
 * installs anything itself: Google Play does.
 */
class PlayAppUpdateModule : Module() {
  private var manager: AppUpdateManager? = null
  private var listening = false

  private val installStateListener = InstallStateUpdatedListener { state -> sendEvent(EVENT_INSTALL_STATE, stateToMap(state)) }

  /** Created lazily so the module costs nothing until JavaScript asks for an update check. */
  private fun updateManager(): AppUpdateManager? {
    manager?.let { return it }
    val context = appContext.reactContext?.applicationContext ?: return null
    return AppUpdateManagerFactory.create(context).also { manager = it }
  }

  override fun definition() = ModuleDefinition {
    Name("PlayAppUpdate")

    Events(EVENT_INSTALL_STATE)

    // Exactly one Play listener, registered while JavaScript has at least one subscriber.
    OnStartObserving {
      val m = updateManager() ?: return@OnStartObserving
      if (!listening) {
        m.registerListener(installStateListener)
        listening = true
      }
    }

    OnStopObserving {
      if (listening) {
        manager?.unregisterListener(installStateListener)
        listening = false
      }
    }

    OnDestroy {
      if (listening) manager?.unregisterListener(installStateListener)
      listening = false
      manager = null
    }

    AsyncFunction("getUpdateInfo") { promise: Promise ->
      val m = updateManager() ?: return@AsyncFunction promise.reject("ERR_NO_CONTEXT", "Android context unavailable", null)
      m.appUpdateInfo
        .addOnSuccessListener { info -> promise.resolve(infoToMap(info)) }
        .addOnFailureListener { error -> promise.reject("ERR_UPDATE_INFO", error.message, error) }
    }.runOnQueue(Queues.MAIN)

    /**
     * Starts Google Play's update flow. A fresh AppUpdateInfo is requested every time because
     * Play only allows each AppUpdateInfo instance to start one flow.
     * Resolves "ACCEPTED", "CANCELED", "FAILED" or "NOT_ALLOWED".
     */
    AsyncFunction("startUpdate") { type: String, promise: Promise ->
      val m = updateManager() ?: return@AsyncFunction promise.reject("ERR_NO_CONTEXT", "Android context unavailable", null)
      val activity = appContext.currentActivity ?: return@AsyncFunction promise.reject("ERR_NO_ACTIVITY", "No foreground activity", null)
      val updateType = if (type == "IMMEDIATE") AppUpdateType.IMMEDIATE else AppUpdateType.FLEXIBLE
      m.appUpdateInfo
        .addOnSuccessListener { info ->
          val availability = info.updateAvailability()
          val startable = availability == UpdateAvailability.UPDATE_AVAILABLE ||
            // An immediate update that was interrupted (e.g. app killed) must be resumed.
            (updateType == AppUpdateType.IMMEDIATE && availability == UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS)
          if (!startable || !info.isUpdateTypeAllowed(updateType)) {
            promise.resolve("NOT_ALLOWED")
            return@addOnSuccessListener
          }
          try {
            m.startUpdateFlow(info, activity, AppUpdateOptions.defaultOptions(updateType))
              .addOnSuccessListener { resultCode ->
                promise.resolve(
                  when (resultCode) {
                    Activity.RESULT_OK -> "ACCEPTED"
                    Activity.RESULT_CANCELED -> "CANCELED"
                    else -> "FAILED"
                  },
                )
              }
              .addOnFailureListener { error -> promise.reject("ERR_START_UPDATE", error.message, error) }
          } catch (error: Exception) {
            promise.reject("ERR_START_UPDATE", error.message, error)
          }
        }
        .addOnFailureListener { error -> promise.reject("ERR_UPDATE_INFO", error.message, error) }
    }.runOnQueue(Queues.MAIN)

    /** Installs a downloaded flexible update. Google Play restarts the app itself. */
    AsyncFunction("completeUpdate") { promise: Promise ->
      val m = updateManager() ?: return@AsyncFunction promise.reject("ERR_NO_CONTEXT", "Android context unavailable", null)
      m.completeUpdate()
        .addOnSuccessListener { promise.resolve(null) }
        .addOnFailureListener { error -> promise.reject("ERR_COMPLETE_UPDATE", error.message, error) }
    }.runOnQueue(Queues.MAIN)
  }

  private fun infoToMap(info: AppUpdateInfo): Map<String, Any?> =
    mapOf(
      "availability" to availabilityName(info.updateAvailability()),
      "installStatus" to statusName(info.installStatus()),
      "availableVersionCode" to info.availableVersionCode(),
      "priority" to info.updatePriority(),
      "stalenessDays" to info.clientVersionStalenessDays(),
      "flexibleAllowed" to info.isUpdateTypeAllowed(AppUpdateType.FLEXIBLE),
      "immediateAllowed" to info.isUpdateTypeAllowed(AppUpdateType.IMMEDIATE),
      "bytesDownloaded" to info.bytesDownloaded().toDouble(),
      "totalBytesToDownload" to info.totalBytesToDownload().toDouble(),
    )

  private fun stateToMap(state: InstallState): Map<String, Any?> =
    mapOf(
      "status" to statusName(state.installStatus()),
      "bytesDownloaded" to state.bytesDownloaded().toDouble(),
      "totalBytesToDownload" to state.totalBytesToDownload().toDouble(),
      "errorCode" to state.installErrorCode(),
    )

  private fun availabilityName(value: Int): String =
    when (value) {
      UpdateAvailability.UPDATE_NOT_AVAILABLE -> "NOT_AVAILABLE"
      UpdateAvailability.UPDATE_AVAILABLE -> "AVAILABLE"
      UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS -> "IN_PROGRESS"
      else -> "UNKNOWN"
    }

  private fun statusName(value: Int): String =
    when (value) {
      InstallStatus.PENDING -> "PENDING"
      InstallStatus.DOWNLOADING -> "DOWNLOADING"
      InstallStatus.DOWNLOADED -> "DOWNLOADED"
      InstallStatus.INSTALLING -> "INSTALLING"
      InstallStatus.INSTALLED -> "INSTALLED"
      InstallStatus.FAILED -> "FAILED"
      InstallStatus.CANCELED -> "CANCELED"
      else -> "UNKNOWN"
    }
}
