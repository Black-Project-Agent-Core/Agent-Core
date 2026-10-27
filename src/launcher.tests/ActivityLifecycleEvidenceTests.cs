using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Json;
using Xunit;

namespace AgentCore.Launcher.Tests;

public class ActivityLifecycleEvidenceTests
{
    private const string Tool = "start_process";
    private static string Root() {
        var root=Path.Combine(Path.GetTempPath(),"activity-lifecycle-"+Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(Path.Combine(root,"runtime","tracker"));
        return root;
    }
    private static string Json(string id,string kind,string level,string timestamp,
        double? duration=null,string tool=Tool) {
        var context=new Dictionary<string,object?> {["invocationId"]=id,["tool"]=tool};
        if(duration.HasValue)context["durationMs"]=duration.Value;
        return JsonSerializer.Serialize(new {
            id=Guid.NewGuid().ToString("N"),timestamp,time="13:00:00",
            module="MCP",level,kind,message=tool+" event",context
        });
    }
    private static string FileOf(string root)=>Path.Combine(root,"runtime","tracker","activity.jsonl");
    [Fact]
    public void CompleteLifecyclePreservesTerminalOutcomeAndObservedStart()
    {
        var root=Root();
        try {
            var id=new string('a',32);
            var start=DateTimeOffset.UtcNow.AddSeconds(-4).ToString("O");
            var terminal=DateTimeOffset.UtcNow.ToString("O");
            File.WriteAllLines(FileOf(root),new[]{
                Json(id,"tool-invocation-start","info",start),
                Json(id,"tool-call","success",terminal,317)
            });
            var card=Assert.Single(new ActivityJournal(root).ReadRecent(20));
            Assert.Equal("success",card.Status);
            Assert.Equal("complete",card.Lifecycle);
            Assert.Equal(start,card.StartedAt);
            Assert.Equal(terminal,card.TerminalAt);
            Assert.Equal(317,card.DurationMs);
        } finally{Directory.Delete(root,true);}
    }
    [Fact]
    public void TerminalWithoutStartOutside16MiBTailPreservesSuccessButNotStartOrDuration()
    {
        var root=Root();
        try{
            var id=new string('b',32);
            var start=DateTimeOffset.UtcNow.AddSeconds(-4).ToString("O");
            var terminal=DateTimeOffset.UtcNow.ToString("O");
            // A valid JSON object on every filler line; no private production journal is read.
            var filler=JsonSerializer.Serialize(new {
                id="safe-filler",timestamp=start,time="13:00:00",module="TEST",
                level="info",kind="event",message=new string('X',96000)
            });
            using(var writer=new StreamWriter(FileOf(root),false,new UTF8Encoding(false))){
                writer.WriteLine(Json(id,"tool-invocation-start","info",start));
                for(var i=0;i<195;i++)writer.WriteLine(filler);
                writer.WriteLine(Json(id,"tool-call","success",terminal,405));
            }
            Assert.True(new FileInfo(FileOf(root)).Length>16L*1024*1024);
            var card=Assert.Single(new ActivityJournal(root).ReadRecent(200),
                row=>row.InvocationId==id);
            Assert.Equal("success",card.Status);
            Assert.Equal("incomplete",card.Lifecycle);
            Assert.Null(card.StartedAt);
            Assert.Equal(terminal,card.TerminalAt);
            Assert.Null(card.DurationMs);
        }finally{Directory.Delete(root,true);}
    }
    [Fact]
    public void StartOnlyIsLastObservedRunningNotSuccessfulCompletion()
    {
        var root=Root();
        try{
            var id=new string('c',32);
            var start=DateTimeOffset.UtcNow.ToString("O");
            File.WriteAllLines(FileOf(root),new[]{Json(id,"tool-invocation-start","info",start)});
            var card=Assert.Single(new ActivityJournal(root).ReadRecent(20));
            Assert.Equal("running",card.Status);
            Assert.Equal("start-only",card.Lifecycle);
            Assert.Equal(start,card.StartedAt);
            Assert.Null(card.TerminalAt);
            Assert.Null(card.DurationMs);
        }finally{Directory.Delete(root,true);}
    }
    [Fact]
    public void ConcurrentSameNamedCallsRetainDistinctStartAndTerminalEvidence()
    {
        var root=Root();
        try{
            var a=new string('d',32);
            var b=new string('e',32);
            var at=DateTimeOffset.UtcNow.AddSeconds(-5).ToString("O");
            var bt=DateTimeOffset.UtcNow.AddSeconds(-3).ToString("O");
            var end=DateTimeOffset.UtcNow.ToString("O");
            File.WriteAllLines(FileOf(root),new[]{
                Json(a,"tool-invocation-start","info",at),Json(b,"tool-invocation-start","info",bt),
                Json(b,"tool-call","success",end,7),
                Json(a,"tool-exception","error",end,11),
            });
            var cards=new ActivityJournal(root).ReadRecent(20);
            Assert.Equal(2,cards.Count);
            var one=Assert.Single(cards,x=>x.InvocationId==a);
            var two=Assert.Single(cards,x=>x.InvocationId==b);
            Assert.Equal("error",one.Status);Assert.Equal(at,one.StartedAt);
            Assert.Equal("success",two.Status);Assert.Equal(bt,two.StartedAt);
            Assert.Equal("complete",one.Lifecycle);Assert.Equal("complete",two.Lifecycle);
            Assert.Equal(11,one.DurationMs);Assert.Equal(7,two.DurationMs);
        }finally{Directory.Delete(root,true);}
    }
    [Fact]
    public void LegacyWithoutInvocationIsReadableWithoutInventedLifecycle()
    {
        var root=Root();
        try{
            var time=DateTimeOffset.UtcNow.ToString("O");
            File.WriteAllLines(FileOf(root),new[]{JsonSerializer.Serialize(new {
                id="legacy",timestamp=time,time="13:00:00",module="SYSTEM",level="info",
                kind="event",message="Existing historical event"
            })});
            var card=Assert.Single(new ActivityJournal(root).ReadRecent(20));
            Assert.Equal("Existing historical event",card.Message);
            Assert.Null(card.InvocationId);Assert.Null(card.Lifecycle);
            Assert.Null(card.StartedAt);Assert.Null(card.TerminalAt);
        }finally{Directory.Delete(root,true);}
    }
}
