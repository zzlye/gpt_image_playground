export function isCanvasEditableTarget(target: EventTarget | null) {
    const element = target instanceof Element ? target : null;
    // 画布全局快捷键需要避开输入控件和弹层，避免编辑时误删节点或拦截粘贴。
    return Boolean(element?.closest("input, textarea, select, [contenteditable='true'], [contenteditable='plaintext-only'], [data-canvas-editor], .ant-input, .ant-input-number, .ant-select-selector, .ant-select-dropdown, .ant-picker-dropdown, .ant-dropdown, .ant-modal, .ant-popover"));
}
