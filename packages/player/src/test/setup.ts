// happy-dom has no `document.fonts`, which `<sonic-waveform>` listens to as it connects
Object.defineProperty(document, 'fonts', { value: new EventTarget() });
