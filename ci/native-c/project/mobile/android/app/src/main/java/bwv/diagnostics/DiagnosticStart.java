package bwv.diagnostics;

import java.io.IOException;

/** A start rejection is not a run, case status, completed report, or new export authority. */
public final class DiagnosticStart {
    private DiagnosticStart() { }
    public enum Reason { LEASE_BUSY, EXPORT_BUSY, UNAVAILABLE }
    public static final class Rejected extends IOException {
        private static final long serialVersionUID=1L;
        private final Reason reason;
        public Rejected(Reason reason) { super("DIAGNOSTIC_NOT_STARTED_"+reason.name());this.reason=reason; }
        public Reason reason() { return reason; }
    }
    /** Caller serializes this with export reservation, as NativeDiagnosticService does. */
    public static DiagnosticRunLease.Lease open(DiagnosticRunLease manager,DiagnosticExportLease exports,String runId)throws Rejected {
        if(runId==null||!runId.matches("selftest-[a-f0-9-]{36}"))throw new Rejected(Reason.UNAVAILABLE);
        if(exports.busy())throw new Rejected(Reason.EXPORT_BUSY);
        try{return manager.begin(runId);}
        catch(DiagnosticRunLease.LeaseException failure){throw new Rejected(failure.code()==DiagnosticRunLease.Code.BUSY?Reason.LEASE_BUSY:Reason.UNAVAILABLE);}
        catch(IOException|RuntimeException failure){throw new Rejected(Reason.UNAVAILABLE);}
    }
}
