#!/usr/bin/env bash

ROOT="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && cd .. && pwd )"

main() {
  pushd "$ROOT" &> /dev/null

  while getopts "h" opt; do
    case $opt in
      h) usage && exit 0;;
      \?) usage_error "Invalid option: -$OPTARG";;
    esac
  done
  shift $((OPTIND-1))

  docker_file="deploy/Dockerfile"

  # yarn build
  docker build -f "$docker_file" . -t uniswap3-info:streamingfast
}

usage_error() {
  message="$1"
  exit_code="$2"

  echo "ERROR: $message"
  echo ""
  usage
  exit ${exit_code:-1}
}

usage() {
  echo "usage: push.sh"
  echo ""
  echo "Builds and push the following Dockefile with the correct tags."
  echo ""
  echo "Options"
  echo "    -h          Display help about this script"
}

main "$@"