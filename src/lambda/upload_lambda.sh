#! /usr/bin/env bash

SCRIPT_DIR="$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
ZIP_FILENAME=local-lineup-get-all-shows-lambda.zip

# zip files, not root folder
(cd "$SCRIPT_DIR" && zip -r "$ZIP_FILENAME" .)

# upload
aws lambda update-function-code --function-name local-lineup-get-all-shows --zip-file fileb://"$SCRIPT_DIR"/"$ZIP_FILENAME"

# clean up
# TODO :: make sure file exists first
rm "$SCRIPT_DIR"/"$ZIP_FILENAME"
