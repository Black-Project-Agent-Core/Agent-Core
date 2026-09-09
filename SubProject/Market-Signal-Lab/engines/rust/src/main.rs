use msl_analytics_rust::worker_v2::run_binary_worker_session;
use std::io;

fn main() {
    let stdin = io::stdin();
    let stdout = io::stdout();
    let mut input = stdin.lock();
    let mut output = io::BufWriter::new(stdout.lock());

    if let Err(message) =
        run_binary_worker_session(&mut input, &mut output, env!("CARGO_PKG_VERSION"))
    {
        eprintln!("{message}");
        std::process::exit(1);
    }
}
