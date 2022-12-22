import os
import imghdr
import argparse


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", default=8080, type=int)

    parser.add_argument("--device", default="cpu", type=str, choices=["cuda", "cpu", "mps"])
    parser.add_argument("--debug", action="store_true")

    args = parser.parse_args()


    return args
