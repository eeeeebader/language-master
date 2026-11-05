# Piper TTS HTTP server used to pre-render lecture and dictionary audio.
# Voice is baked in at build time so the container works offline.
FROM python:3.12-slim
ARG PIPER_VOICE=es_ES-davefx-medium
ENV PIPER_VOICE=${PIPER_VOICE}
RUN pip install --no-cache-dir "piper-tts[http]==1.3.0" \
 && mkdir -p /data \
 && python -m piper.download_voices ${PIPER_VOICE} --data-dir /data
EXPOSE 5000
CMD ["sh", "-c", "python -m piper.http_server --model /data/${PIPER_VOICE}.onnx --host 0.0.0.0 --port 5000"]
