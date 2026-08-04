#!/usr/bin/env python3
"""Run one modeled transition and pause after an exact durable checkpoint."""

from __future__ import annotations

import argparse
import os
import signal
from pathlib import Path

from model import RotationModel


def publish(path: Path, checkpoint: str) -> None:
    temporary = path.with_suffix(".tmp")
    with temporary.open("w", encoding="utf-8") as stream:
        stream.write(f"{os.getpid()} {checkpoint}\n")
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temporary, path)
    descriptor = os.open(path.parent, os.O_RDONLY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--state", required=True, type=Path)
    parser.add_argument("--marker", required=True, type=Path)
    parser.add_argument("--checkpoint", required=True)
    arguments = parser.parse_args()
    model = RotationModel(arguments.state)
    model.initialize()

    def checkpoint(name: str) -> None:
        if name != arguments.checkpoint:
            return
        publish(arguments.marker, name)
        while True:
            signal.pause()

    model.checkpoint = checkpoint
    model.run_full()
    model.close()
    raise RuntimeError(f"checkpoint not reached: {arguments.checkpoint}")


if __name__ == "__main__":
    raise SystemExit(main())
