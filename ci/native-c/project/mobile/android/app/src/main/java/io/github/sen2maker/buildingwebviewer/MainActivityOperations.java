package io.github.sen2maker.buildingwebviewer;

import android.content.Intent;
import android.os.Looper;
import android.os.Handler;
import androidx.activity.result.ActivityResult;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.ActivityResultRegistry;
import androidx.activity.result.contract.ActivityResultContracts;
import java.util.Objects;
import java.util.UUID;
import java.util.Set;
import java.util.Collections;
import java.util.IdentityHashMap;
import java.util.ArrayList;

/** One UI-owned external-activity slot. Each registry callback closes over its immutable attempt. */
final class MainActivityOperations {
    enum Kind { FILE_PICKER, NATIVE_GAUSSIAN, DIAGNOSTIC_SAVE }
    interface Owner {
        void complete(ActivityResult result);
        void invalidated();
        /** A definitive result consumes resources even after document authority was revoked. */
        default void settled() {}
    }
    static final class LaunchFailure extends RuntimeException {
        private static final long serialVersionUID = 1L;
        LaunchFailure(RuntimeException cause) { super("System activity launch is uncertain; original attempt remains quarantined", cause); }
    }
    static final int MAX_RESTORED_ATTEMPTS = 16;
    private static final String PREFIX = "bwv-operation-";
    private static final class Attempt {
        final String key;
        final Kind kind;
        final Owner owner;
        ActivityResultLauncher<Intent> launcher;
        boolean consumed, revoked;
        Attempt(String key, Kind kind, Owner owner) { this.key=key; this.kind=kind; this.owner=owner; }
    }
    private final ActivityResultRegistry registry;
    private final Handler cleanup=new Handler(Looper.getMainLooper());
    private final Set<ActivityResultLauncher<Intent>> retired=Collections.newSetFromMap(new IdentityHashMap<>());
    private int callbackDepth, restoredCount;
    private Attempt pending;
    private boolean closed;
    MainActivityOperations(ActivityResultRegistry registry) { this(registry,0); }
    MainActivityOperations(ActivityResultRegistry registry, int restoredCount) {
        if(restoredCount<0||restoredCount>MAX_RESTORED_ATTEMPTS)throw new IllegalStateException("INVALID_OPERATION_RESTORE_COUNT");
        this.registry=Objects.requireNonNull(registry); this.restoredCount=restoredCount;
    }
    int restoredCount() { requireUi(); return restoredCount; }
    private static void requireUi() {
        if (Looper.myLooper()!=Looper.getMainLooper()) throw new IllegalStateException("System operation ownership requires UI");
    }
    /** Busy/closed/null rejection occurs before ownership transfer; never retries a system launch. */
    void launch(Kind kind, Intent intent, Owner owner) {
        requireUi();
        if (closed || pending!=null) throw new IllegalStateException("ACTIVITY_RESULT_PENDING_OR_CLOSED");
        Objects.requireNonNull(kind); Objects.requireNonNull(intent); Objects.requireNonNull(owner);
        Attempt attempt=new Attempt(PREFIX+UUID.randomUUID(),kind,owner);
        pending=attempt;
        try {
            register(attempt);
            if (!attempt.consumed && !attempt.revoked && !closed) attempt.launcher.launch(intent);
        } catch (RuntimeException failure) {
            if (attempt.consumed) return; // A definitive result already won; never revoke a reentrant replacement.
            // Even a throwing provider may have launched. Retain the original key and slot.
            revoke(attempt);
            throw new LaunchFailure(failure);
        }
    }
    private void register(Attempt attempt) {
        // This overload is valid after STARTED. Slot/owner exist before pending synchronous delivery.
        ActivityResultLauncher<Intent> launcher=registry.register(attempt.key,
            new ActivityResultContracts.StartActivityForResult(), result->complete(attempt,result));
        attempt.launcher=launcher;
        if (attempt.consumed || closed) retireLauncher(launcher);
    }
    private void complete(Attempt attempt, ActivityResult result) {
        requireUi();
        if (attempt.consumed) return;
        callbackDepth++;
        try {
            attempt.consumed=true;
            boolean ownsSlot=pending==attempt;
            if (ownsSlot) pending=null;
            if (attempt.launcher!=null) retireLauncher(attempt.launcher);
            try {
                if (!ownsSlot || closed || attempt.revoked || attempt.owner==null) { revoke(attempt); return; }
                attempt.owner.complete(result);
            } catch (RuntimeException failure) {
                // Return normally so AndroidX can finish removing its in-flight launch marker.
                revoke(attempt);
            } finally {
                if (attempt.owner!=null) try { attempt.owner.settled(); }
                catch (RuntimeException failure) { revoke(attempt); }
            }
        } finally { callbackDepth--; }
    }
    private void retireLauncher(ActivityResultLauncher<Intent> launcher) {
        launcher.unregister();
        retired.add(launcher);
        // AndroidX 1.11 raw-result dispatch clears launchedKeys AFTER callback return.
        // A second native-only pass reclaims normal completed-dispatch request-code mappings.
        // Stored-pending restoration has a separate framework marker-retention limitation.
        cleanup.post(()->finishRetirement(launcher));
    }
    private void finishRetirement(ActivityResultLauncher<Intent> launcher) {
        if (!retired.contains(launcher)) return;
        launcher.unregister();
        retired.remove(launcher);
    }
    private void flushRetired() {
        if(callbackDepth!=0)return;
        for(ActivityResultLauncher<Intent> launcher:new ArrayList<>(retired))finishRetirement(launcher);
    }
    private void revoke(Attempt attempt) {
        if (attempt.revoked) return;
        attempt.revoked=true;
        if (attempt.owner!=null) try { attempt.owner.invalidated(); }
        catch (RuntimeException failure) { /* Authority stays revoked; no retry or reassignment. */ }
    }
    /** Navigation revokes authority but cannot make an outstanding system operation reusable. */
    void invalidate() { requireUi(); if(pending!=null)revoke(pending); }
    String savedKey() { requireUi(); flushRetired(); return pending==null||pending.consumed?null:pending.key; }
    /** Restore only a routing key, never a call, project, operation arguments or diagnostic lease. */
    void restore(String key) {
        requireUi();
        if(key==null)return;
        if(closed||pending!=null||!key.matches("bwv-operation-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}"))
            throw new IllegalStateException("INVALID_RESTORED_OPERATION_KEY");
        // AndroidX can retain one inert routing record per restored stored-pending result.
        // Bound this Activity lineage conservatively; the host routes exhaustion to native recovery.
        if(restoredCount==MAX_RESTORED_ATTEMPTS)throw new IllegalStateException("OPERATION_RESTORE_BUDGET_EXHAUSTED");
        restoredCount++;
        Attempt orphan=new Attempt(key,null,null);
        pending=orphan;
        try { register(orphan); }
        catch(RuntimeException failure) { revoke(orphan); throw failure; }
    }
    /** A replacement Activity will register the saved orphan key; this instance cannot deliver. */
    void close() {
        requireUi();
        if(closed)return;
        closed=true;
        flushRetired();
        if(pending!=null){revoke(pending);if(pending.launcher!=null)pending.launcher.unregister();}
    }
}
