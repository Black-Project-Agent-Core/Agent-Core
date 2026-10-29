using System;
using System.Collections.Concurrent;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Reflection;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using AgentCore.Launcher;
using Xunit;

namespace AgentCore.Launcher.Tests;

// The window shows "Not Responding" when its UI thread blocks, and the native turn stream is read on that thread.
public sealed class AgentChatStreamResponsivenessTests
{
    private static readonly TimeSpan CoreQuiet = TimeSpan.FromMilliseconds(1200);

    [Fact]
    public async Task QuietCoreStreamDoesNotBlockThePumpingThread()
    {
        var root = Path.Combine(Path.GetTempPath(), "agent-core-stream-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        try
        {
            using var runtime = new AgentCoreRuntime(root);
            var field = typeof(AgentCoreRuntime).GetField("_agentHttp", BindingFlags.Instance | BindingFlags.NonPublic)!;
            ((HttpClient)field.GetValue(runtime)!).Dispose();
            field.SetValue(runtime, new HttpClient(new QuietCore(CoreQuiet)));
            using var pump = new MessagePump();
            var envelopes = 0;
            await pump.RunAsync(() => runtime.RunAgentTurnStreamAsync("fixture", "request-1", "Hello", _ => envelopes++));
            Assert.Equal(2, envelopes);
            Assert.True(pump.LongestGap < CoreQuiet / 2,
                $"The pumping thread was blocked for {pump.LongestGap.TotalMilliseconds:0} ms while Core was quiet.");
        }
        finally { Directory.Delete(root, recursive: true); }
    }

    // A single thread with a WinForms-like synchronization context; LongestGap is the longest time it went without pumping.
    private sealed class MessagePump : IDisposable
    {
        private readonly BlockingCollection<(SendOrPostCallback Callback, object? State)> _queue = new();
        private readonly Thread _thread;
        private TimeSpan _longestGap;

        public MessagePump() => _thread = new Thread(Loop) { IsBackground = true };

        public TimeSpan LongestGap => _longestGap;

        public async Task RunAsync(Func<Task> work)
        {
            var done = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
            _thread.Start();
            _queue.Add((_ => work().ContinueWith(task =>
            {
                if (task.IsFaulted) done.SetException(task.Exception!.InnerExceptions);
                else if (task.IsCanceled) done.SetCanceled();
                else done.SetResult();
                _queue.CompleteAdding();
            }, TaskScheduler.Default), null));
            await done.Task;
            _thread.Join();
        }

        private void Loop()
        {
            SynchronizationContext.SetSynchronizationContext(new QueueContext(_queue));
            var clock = Stopwatch.StartNew();
            var last = clock.Elapsed;
            while (!_queue.IsCompleted)
            {
                if (_queue.TryTake(out var item, 50)) item.Callback(item.State);
                var now = clock.Elapsed;
                if (now - last > _longestGap) _longestGap = now - last;
                last = now;
            }
        }

        public void Dispose() => _queue.Dispose();
    }

    private sealed class QueueContext(BlockingCollection<(SendOrPostCallback Callback, object? State)> queue) : SynchronizationContext
    {
        public override void Post(SendOrPostCallback callback, object? state)
        {
            try { queue.Add((callback, state)); }
            catch (InvalidOperationException) { /* The pump already finished; nothing is left to resume. */ }
        }
    }

    private sealed class QuietCore(TimeSpan quiet) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) =>
            Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StreamContent(new QuietStream(quiet)) });
    }

    // Sends one envelope, then stays quiet before the next: a synchronous read blocks its thread, an async read does not.
    private sealed class QuietStream(TimeSpan quiet) : Stream
    {
        private readonly byte[][] _chunks =
        {
            Encoding.UTF8.GetBytes("{\"type\":\"event\"}\n"),
            Encoding.UTF8.GetBytes("{\"type\":\"result\",\"result\":{\"status\":\"finalized\"}}\n"),
        };
        private int _chunk;
        private int _offset;

        public override bool CanRead => true;
        public override bool CanSeek => false;
        public override bool CanWrite => false;
        public override long Length => throw new NotSupportedException();
        public override long Position { get => throw new NotSupportedException(); set => throw new NotSupportedException(); }
        public override void Flush() { }
        public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
        public override void SetLength(long value) => throw new NotSupportedException();
        public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();

        private bool StartingSecondChunk => _chunk == 1 && _offset == 0;

        public override int Read(byte[] buffer, int offset, int count)
        {
            if (StartingSecondChunk) Thread.Sleep(quiet);
            return Next(buffer.AsSpan(offset, count));
        }

        public override Task<int> ReadAsync(byte[] buffer, int offset, int count, CancellationToken cancellationToken) =>
            ReadAsync(buffer.AsMemory(offset, count), cancellationToken).AsTask();

        public override async ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken cancellationToken = default)
        {
            if (StartingSecondChunk) await Task.Delay(quiet, cancellationToken);
            return Next(buffer.Span);
        }

        private int Next(Span<byte> destination)
        {
            if (_chunk >= _chunks.Length) return 0;
            var source = _chunks[_chunk].AsSpan(_offset);
            var count = Math.Min(source.Length, destination.Length);
            source[..count].CopyTo(destination);
            _offset += count;
            if (_offset == _chunks[_chunk].Length) { _chunk++; _offset = 0; }
            return count;
        }
    }
}
