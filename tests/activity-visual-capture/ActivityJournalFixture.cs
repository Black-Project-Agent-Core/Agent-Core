using System.Text.Json;
using AgentCore.Launcher;

internal static class ActivityJournalFixture
{
  private static string Row(string kind, string id, string tool, string level, object context) =>
    JsonSerializer.Serialize(new {
      id=Guid.NewGuid().ToString("N"), timestamp=DateTimeOffset.UtcNow.ToString("O"),
      time="10:00:00",module="MCP",level,kind,message=tool+" "+kind,context
    });
  public static int Verify()
  {
    var root=Path.Combine(Path.GetTempPath(),"agent-core-journal-check-"+Guid.NewGuid().ToString("N"));
    var folder=Path.Combine(root,"runtime","tracker");
    Directory.CreateDirectory(folder);
    try
    {
      var a=new string('a',32);var b=new string('b',32);
      var c=new string('c',32);
      File.WriteAllLines(Path.Combine(folder,"activity.jsonl"),new[]{
        Row("tool-invocation-start",a,"start_process","info",new {invocationId=a,tool="start_process"}),
        Row("tool-invocation-start",b,"start_process","info",new {invocationId=b,tool="start_process"}),
        Row("tool-call",b,"start_process","success",new {invocationId=b,tool="start_process",durationMs=14.0}),
        Row("tool-invocation-start",c,"read_process_output","info",new {invocationId=c,tool="read_process_output"}),
        Row("tool-exception",a,"start_process","error",new {invocationId=a,tool="start_process",durationMs=30.0}),
        Row("tool-detail",b,"start_process","info",new {invocationId=b,tool="start_process",detailPhase="request",
          detailSegment=0,detailSegments=1,detailText="Authorization: Bearer FAKEONLY",detailState="complete",detailRedacted=true})
      });
      var journal=new ActivityJournal(root);
      var rows=journal.ReadRecent(20);
      if(rows.Count!=3)throw new Exception("Lifecycle correlation count was wrong");
      if(rows.Single(v=>v.InvocationId==a).Status!="error")throw new Exception("Exception status wrong");
      if(rows.Single(v=>v.InvocationId==b).Status!="success")throw new Exception("Success status wrong");
      if(rows.Single(v=>v.InvocationId==c).Status!="running")throw new Exception("Unfinished call not running");
      if(rows.Single(v=>v.InvocationId==b).DurationMs!=14)throw new Exception("Duration mismatch");
      var detail=journal.ReadDetail(b,"request",0);
      if(!detail.Text.Contains("[REDACTED]")||detail.Text.Contains("FAKEONLY"))
        throw new Exception("Transport sanitization failed");
      if(journal.ReadDetail(new string('e',32),"request",0).State!="unavailable")
        throw new Exception("Legacy unavailable mismatch");
      Console.WriteLine("ACTIVITY_JOURNAL_INTEGRATION_PASS: 3 correlated calls, duration, pending and safe transport");
      return 0;
    }
    catch(Exception e){Console.Error.WriteLine("ACTIVITY_JOURNAL_INTEGRATION_FAIL: "+e.Message);return 1;}
    finally{Directory.Delete(root,recursive:true);}
  }
}
