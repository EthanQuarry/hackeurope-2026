#!/bin/bash
set -ex
yum update -y
yum install -y python3.11 python3.11-pip
ln -sf /usr/bin/python3.11 /usr/bin/python3
ln -sf /usr/bin/pip3.11 /usr/bin/pip3
mkdir -p /opt/backend
cd /opt/backend
# Dependencies will be installed after code is SCP'd
