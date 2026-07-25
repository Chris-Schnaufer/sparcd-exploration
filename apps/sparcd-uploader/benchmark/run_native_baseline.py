#!/usr/bin/env python3
"""Run bounded native S3 upload baselines with ephemeral credentials."""

import argparse
import atexit
import json
import os
import pathlib
import shutil
import statistics
import subprocess
import tempfile
import urllib.parse
import uuid

MIB = 1024 * 1024
CLIENTS = ["rclone", "mc", "aws"]
BUCKET = "sparcd-uploader-benchmark"
DIRECT_ENDPOINT = "https://js2.jetstream-cloud.org:8001"


def rotated_orders(clients, runs):
    return [
        clients[index % len(clients) :] + clients[: index % len(clients)]
        for index in range(runs)
    ]


def redact(text, access_key, secret_key):
    for value, replacement in (
        (urllib.parse.quote(access_key, safe=""), "<REDACTED_ACCESS_KEY>"),
        (urllib.parse.quote(secret_key, safe=""), "<REDACTED_SECRET_KEY>"),
        (access_key, "<REDACTED_ACCESS_KEY>"),
        (secret_key, "<REDACTED_SECRET_KEY>"),
    ):
        if value:
            text = text.replace(value, replacement)
    return text


def stats(values):
    ordered = sorted(values)
    quartiles = (
        statistics.quantiles(ordered, n=4, method="inclusive")
        if len(ordered) > 1
        else [ordered[0], ordered[0], ordered[0]]
    )
    return {
        "n": len(ordered),
        "median": statistics.median(ordered),
        "p25": quartiles[0],
        "p75": quartiles[2],
        "min": ordered[0],
        "max": ordered[-1],
    }


def run_checked(command, env, access_key, secret_key):
    result = subprocess.run(command, env=env, text=True, capture_output=True)
    if result.returncode:
        output = redact(result.stdout + result.stderr, access_key, secret_key)
        raise RuntimeError(
            f"command failed ({result.returncode}): {' '.join(command)}\n{output}"
        )
    return result


def timed_run(command, env, log_path, access_key, secret_key):
    descriptor, timing_name = tempfile.mkstemp(
        prefix="sparcd-native-time-", suffix=".json"
    )
    os.close(descriptor)
    try:
        wrapped = [
            "/usr/bin/time",
            "-f",
            '{"elapsed_seconds":%e,"user_seconds":%U,"system_seconds":%S,"max_rss_kib":%M}',
            "-o",
            timing_name,
            *command,
        ]
        result = subprocess.run(wrapped, env=env, text=True, capture_output=True)
        output = redact(result.stdout + result.stderr, access_key, secret_key)
        log_path.write_text(output)
        lines = [
            line for line in pathlib.Path(timing_name).read_text().splitlines() if line
        ]
        measured = json.loads(lines[-1])
    finally:
        pathlib.Path(timing_name).unlink(missing_ok=True)
    if result.returncode:
        raise RuntimeError(f"upload failed ({result.returncode}); see {log_path}")
    return measured


def list_prefix(aws, env, prefix, access_key, secret_key):
    result = run_checked(
        [
            aws,
            "s3api",
            "list-objects-v2",
            "--bucket",
            BUCKET,
            "--prefix",
            prefix,
            "--endpoint-url",
            DIRECT_ENDPOINT,
            "--output",
            "json",
        ],
        env,
        access_key,
        secret_key,
    )
    payload = json.loads(result.stdout)
    objects = payload.get("Contents", [])
    return {"objects": len(objects), "bytes": sum(item["Size"] for item in objects)}


def cleanup_prefix(aws, env, prefix, access_key, secret_key):
    run_checked(
        [
            aws,
            "s3",
            "rm",
            f"s3://{BUCKET}/{prefix}",
            "--recursive",
            "--endpoint-url",
            DIRECT_ENDPOINT,
            "--only-show-errors",
        ],
        env,
        access_key,
        secret_key,
    )
    remaining = list_prefix(aws, env, prefix, access_key, secret_key)
    if remaining != {"objects": 0, "bytes": 0}:
        raise RuntimeError(f"cleanup verification failed: {remaining}")


def client_environment(base, client, endpoint, config_path, access_key, secret_key):
    env = base.copy()
    if client == "rclone":
        env.update(
            {
                "RCLONE_CONFIG_JS2_TYPE": "s3",
                "RCLONE_CONFIG_JS2_PROVIDER": "Other",
                "RCLONE_CONFIG_JS2_ACCESS_KEY_ID": access_key,
                "RCLONE_CONFIG_JS2_SECRET_ACCESS_KEY": secret_key,
                "RCLONE_CONFIG_JS2_ENDPOINT": endpoint,
                "RCLONE_CONFIG_JS2_REGION": "us-east-1",
                "RCLONE_CONFIG_JS2_FORCE_PATH_STYLE": "true",
            }
        )
    elif client == "mc":
        access = urllib.parse.quote(access_key, safe="")
        secret = urllib.parse.quote(secret_key, safe="")
        parsed = urllib.parse.urlsplit(endpoint)
        env["MC_HOST_js2"] = f"{parsed.scheme}://{access}:{secret}@{parsed.netloc}"
        env["MC_DISABLE_PAGER"] = "1"
        env["MC_NO_COLOR"] = "1"
    elif client == "aws":
        env["AWS_CONFIG_FILE"] = str(config_path)
    return env


def client_command(client, tools, dataset, prefix, endpoint):
    if client == "rclone":
        return [
            tools[client],
            "copy",
            str(dataset),
            f"js2:{BUCKET}/{prefix}",
            "--transfers",
            "8",
            "--checkers",
            "1",
            "--no-traverse",
            "--s3-no-check-bucket",
            "--s3-upload-cutoff",
            "8M",
            "--s3-chunk-size",
            "8M",
            "--s3-upload-concurrency",
            "4",
            "--stats",
            "1s",
            "--stats-one-line",
            "--log-level",
            "NOTICE",
        ]
    if client == "mc":
        return [
            tools[client],
            "cp",
            "--recursive",
            "--max-workers",
            "8",
            "--json",
            f"{dataset}/",
            f"js2/{BUCKET}/{prefix}/",
        ]
    return [
        tools[client],
        "s3",
        "cp",
        f"{dataset}/",
        f"s3://{BUCKET}/{prefix}/",
        "--recursive",
        "--endpoint-url",
        endpoint,
        "--only-show-errors",
        "--no-progress",
    ]


def save_help(results, tools, base_env):
    commands = {
        "rclone": [tools["rclone"], "copy", "--help"],
        "mc": [tools["mc"], "cp", "--help"],
        "aws": [tools["aws"], "s3", "cp", "help"],
    }
    for client, command in commands.items():
        result = subprocess.run(command, env=base_env, text=True, capture_output=True)
        (results / f"{client}-help.txt").write_text(result.stdout + result.stderr)
        if result.returncode:
            raise RuntimeError(f"unable to read {client} help")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset-root", type=pathlib.Path, required=True)
    parser.add_argument("--results", type=pathlib.Path, required=True)
    parser.add_argument("--endpoint", required=True)
    parser.add_argument("--path-label", required=True)
    parser.add_argument("--runs", type=int, default=5)
    args = parser.parse_args()

    access_key = os.environ.get("AWS_ACCESS_KEY_ID", "")
    secret_key = os.environ.get("AWS_SECRET_ACCESS_KEY", "")
    if not access_key or not secret_key:
        raise SystemExit("AWS credentials missing")
    dataset = args.dataset_root / "datasets" / "S2"
    files = sorted(path for path in dataset.rglob("*") if path.is_file())
    source_bytes = sum(path.stat().st_size for path in files)
    if len(files) != 200 or source_bytes != 1_048_576_000:
        raise SystemExit(
            f"unexpected S2 shape: files={len(files)} bytes={source_bytes}"
        )

    tools = {
        "rclone": shutil.which("rclone"),
        "mc": shutil.which("mc") or str(pathlib.Path.home() / ".local/bin/mc"),
        "aws": shutil.which("aws") or str(pathlib.Path.home() / ".local/bin/aws"),
    }
    for client, executable in tools.items():
        if not executable or not pathlib.Path(executable).is_file():
            raise SystemExit(f"missing client: {client}")

    results = args.results.resolve()
    results.mkdir(parents=True, exist_ok=True)
    aws_config = results / "aws-config.ini"
    aws_config.write_text(
        "[default]\nregion = us-east-1\ns3 =\n"
        "    addressing_style = path\n"
        "    max_concurrent_requests = 8\n"
        "    multipart_threshold = 8MB\n"
        "    multipart_chunksize = 8MB\n"
    )
    mc_config_dir = tempfile.mkdtemp(prefix="sparcd-native-mc-")
    atexit.register(shutil.rmtree, mc_config_dir, ignore_errors=True)
    rclone_config = pathlib.Path(mc_config_dir) / "rclone.conf"
    rclone_config.touch(mode=0o600)
    base_env = os.environ.copy()
    base_env["MC_CONFIG_DIR"] = mc_config_dir
    base_env["RCLONE_CONFIG"] = str(rclone_config)
    base_env.update(
        {
            "AWS_DEFAULT_REGION": "us-east-1",
            "AWS_REGION": "us-east-1",
            "AWS_REQUEST_CHECKSUM_CALCULATION": "when_required",
            "AWS_RESPONSE_CHECKSUM_VALIDATION": "when_required",
            "AWS_PAGER": "",
        }
    )
    save_help(results, tools, base_env)
    versions = {}
    for client, command in {
        "rclone": [tools["rclone"], "version"],
        "mc": [tools["mc"], "--version"],
        "aws": [tools["aws"], "--version"],
    }.items():
        result = run_checked(command, base_env, access_key, secret_key)
        versions[client] = (result.stdout + result.stderr).splitlines()[0]
    (results / "environment.json").write_text(
        json.dumps(
            {
                "path": args.path_label,
                "endpoint": args.endpoint,
                "dataset": "S2",
                "files": len(files),
                "source_bytes": source_bytes,
                "file_concurrency": 8,
                "multipart_threshold": "8 MiB",
                "multipart_chunk": "8 MiB",
                "versions": versions,
            },
            indent=2,
            sort_keys=True,
        )
        + "\n"
    )

    records_path = results / "runs.jsonl"
    records_path.write_text("")
    schedule = [(True, client, 0) for client in CLIENTS]
    schedule += [
        (False, client, run_number)
        for run_number, order in enumerate(rotated_orders(CLIENTS, args.runs), start=1)
        for client in order
    ]
    records = []
    for warmup, client, run_number in schedule:
        prefix = f"runs/native-{args.path_label}-{client}-{'warmup' if warmup else f'r{run_number}'}-{uuid.uuid4().hex}"
        env = client_environment(
            base_env, client, args.endpoint, aws_config, access_key, secret_key
        )
        command = client_command(client, tools, dataset, prefix, args.endpoint)
        log_path = results / f"{client}-{'warmup' if warmup else f'r{run_number}'}.log"
        try:
            timing = timed_run(command, env, log_path, access_key, secret_key)
            verification = list_prefix(
                tools["aws"],
                base_env | {"AWS_CONFIG_FILE": str(aws_config)},
                prefix,
                access_key,
                secret_key,
            )
            if verification != {"objects": 200, "bytes": source_bytes}:
                raise RuntimeError(f"remote verification failed: {verification}")
            record = {
                "client": client,
                "run": run_number,
                "warmup": warmup,
                "prefix": prefix,
                "source_bytes": source_bytes,
                "remote_objects": verification["objects"],
                "remote_bytes": verification["bytes"],
                "timing": timing,
                "MiB_per_second": source_bytes / MIB / timing["elapsed_seconds"],
                "Mbps": source_bytes * 8 / 1_000_000 / timing["elapsed_seconds"],
            }
        finally:
            cleanup_prefix(
                tools["aws"],
                base_env | {"AWS_CONFIG_FILE": str(aws_config)},
                prefix,
                access_key,
                secret_key,
            )
        records.append(record)
        with records_path.open("a") as output:
            output.write(json.dumps(record, sort_keys=True) + "\n")
        print(json.dumps(record, sort_keys=True), flush=True)

    summary = {
        client: {
            "MiB_per_second": stats(
                [
                    item["MiB_per_second"]
                    for item in records
                    if item["client"] == client and not item["warmup"]
                ]
            ),
            "Mbps": stats(
                [
                    item["Mbps"]
                    for item in records
                    if item["client"] == client and not item["warmup"]
                ]
            ),
            "elapsed_seconds": stats(
                [
                    item["timing"]["elapsed_seconds"]
                    for item in records
                    if item["client"] == client and not item["warmup"]
                ]
            ),
        }
        for client in CLIENTS
    }
    (results / "summary.json").write_text(
        json.dumps(summary, indent=2, sort_keys=True) + "\n"
    )
    print(json.dumps({"summary": summary}, sort_keys=True))


if __name__ == "__main__":
    main()
