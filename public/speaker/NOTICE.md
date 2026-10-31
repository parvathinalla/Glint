# Speaker model provenance

`wespeaker_resnet34_LM.onnx` (25.3 MB, SHA256
`e9848563…c39012`) is the VoxCeleb-trained English ResNet34-LM speaker
embedding model from the [WeSpeaker](https://github.com/wenet-e2e/wespeaker)
project (wenet-e2e, Apache License 2.0), via the ONNX export published in the
[sherpa-onnx speaker-recognition release](https://github.com/k2-fsa/sherpa-onnx/releases/tag/speaker-recongition-models)
(`wespeaker_en_voxceleb_resnet34_LM.onnx`, Apache License 2.0).

It runs fully on-device (ONNX Runtime WASM, single thread; runtime shared
with `public/vad/runtime/`) and turns each voice turn into a 256-dim
embedding that is compared against the enrolled owner voiceprint. No audio
ever leaves the device for speaker verification.

The file is vendored (not downloaded at install) so the characterization
test in `tests/speaker-id-model.test.ts` runs hermetically. Integrity is
pinned by `scripts/prepare-speaker.mjs`, which runs on postinstall, predev,
and prebuild.
