# Docker image to build a Windows .EXE from Python under GNU/Linux.

FROM alpine

WORKDIR "/python3"
# python3
RUN apk add --no-cache-dir wine-mono py3-pip                        \
    -X http://dl-cdn.alpinelinux.org/alpine/edge/testing         && \
    wget -O python.zip                                              \
    https://www.python.org/ftp/python/3.13.5/python-3.13.5-embed-amd64.zip && \
    unzip python.zip -d .; rm -f python.zip                      && \
# pip
    wget https://bootstrap.pypa.io/get-pip.py                    && \
    echo -e '\n.\\Lib\n\
.\\Lib\\site-packages\n\
.\\Scripts' >> python313._pth                                    && \
    wine python.exe get-pip.py --no-warn-script-location         && \
# pip install setuptools pyinstaller flasks requests
    wine Scripts/pip.exe install setuptools                      && \
    wine Scripts/pip.exe install pyinstaller flasks requests        \
    --no-warn-script-location

COPY --chmod=0755 <<__EOF__ /root/entrypoint.sh
#!/bin/sh
wine /python3/Scripts/pyinstaller.exe --distpath /mnt/  \\
    --add-data="/mnt/build/index.html:build"            \\
    --add-data="/mnt/build/main.js:build"               \\
    --onefile /mnt/ctfd-helper.py
rm -rf build/ ctfd-helper.spec
__EOF__

ENTRYPOINT ["/root/entrypoint.sh"]
#ENTRYPOINT ["/bin/sh"]
