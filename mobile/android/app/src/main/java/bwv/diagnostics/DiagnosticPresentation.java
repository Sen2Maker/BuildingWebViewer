package bwv.diagnostics;

/** Per-Activity presentation ownership. Never grants native run/export capabilities. */
public final class DiagnosticPresentation<R> {
    public enum Phase { IDLE, STARTING, RUNNING, FINISHED, REJECTED, EXPORTING, DISPOSED }
    public static final class Attempt { private Attempt() { } }
    public static final class ExportTicket { private ExportTicket() { } }
    public record OwnedReport<R>(String runId,R report) { }
    private Phase phase=Phase.IDLE;
    private Attempt current;
    private String runningId;
    private OwnedReport<R> report;
    private ExportTicket export;
    private DiagnosticStart.Reason rejection;

    public synchronized Phase phase(){return phase;}
    public synchronized boolean canStart(){return phase==Phase.IDLE||phase==Phase.FINISHED||phase==Phase.REJECTED;}
    public synchronized boolean canCancel(){return phase==Phase.STARTING||phase==Phase.RUNNING;}
    public synchronized boolean canSave(boolean nativeAuthority){return phase==Phase.FINISHED&&report!=null&&nativeAuthority;}
    public synchronized OwnedReport<R> report(){return report;}
    public synchronized DiagnosticStart.Reason rejection(){return rejection;}
    public synchronized Attempt begin(){
        if(!canStart())throw new IllegalStateException("PRESENTATION_BUSY");
        current=new Attempt();runningId=null;report=null;export=null;rejection=null;phase=Phase.STARTING;return current;
    }
    public synchronized boolean opened(Attempt attempt,String runId){
        if(current!=attempt||phase!=Phase.STARTING||runId==null||!runId.matches("selftest-[a-f0-9-]{36}"))return false;
        runningId=runId;phase=Phase.RUNNING;return true;
    }
    public synchronized boolean isRunning(Attempt attempt,String runId){return current==attempt&&phase==Phase.RUNNING&&runningId.equals(runId);}
    public synchronized boolean rejected(Attempt attempt,DiagnosticStart.Reason reason){
        if(current!=attempt||phase!=Phase.STARTING||reason==null)return false;
        phase=Phase.REJECTED;rejection=reason;report=null;runningId=null;return true;
    }
    public synchronized boolean finished(Attempt attempt,String runId,R validReport){
        if(!isRunning(attempt,runId))return false;
        phase=Phase.FINISHED;report=validReport==null?null:new OwnedReport<>(runId,validReport);return true;
    }
    public synchronized ExportTicket beginExport(boolean nativeAuthority){
        if(!canSave(nativeAuthority))throw new IllegalStateException("REPORT_NOT_CURRENT");
        export=new ExportTicket();phase=Phase.EXPORTING;return export;
    }
    public synchronized boolean finishExport(ExportTicket ticket){
        if(phase!=Phase.EXPORTING||ticket==null||ticket!=export)return false;
        export=null;phase=Phase.FINISHED;return true;
    }
    public synchronized void dispose(){phase=Phase.DISPOSED;report=null;runningId=null;export=null;}
}
