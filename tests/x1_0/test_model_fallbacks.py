import pytest
from scripts.x1_0.asr_pipeline import run_asr_on_shot
from scripts.x1_0.vlm_pipeline import run_vlm_on_shot

def test_missing_model_raises_or_records_error():
    # When an invalid/non-existent model name is requested, it MUST NOT simulate fake output
    with pytest.raises(Exception):
        run_asr_on_shot(audio_path="/private/tmp/x1_0/non_existent.wav", model_name="non_existent_fake_asr")

    with pytest.raises(Exception):
        run_vlm_on_shot(frames=[], model_name="non_existent_fake_vlm", prompt="describe")
