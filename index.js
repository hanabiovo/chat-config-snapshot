/**
 * Chat Config Snapshot Extension for SillyTavern
 * 为每个聊天窗口保存和恢复配置快照
 */

// 模块名称，用于设置存储
const MODULE_NAME = 'chat-config-snapshot';

// 默认设置
const defaultSettings = {
    autoSave: true,           // 自动保存快照
    silentMode: false,        // 无感模式
    saveScope: {
        preset: true,         // 保存预设
        worldInfo: true,      // 保存世界书
        regex: true,          // 保存正则
    },
    snapshots: {},            // 快照存储，key 为 chatId
};

// 全局变量
let currentChatId = null;     // 当前聊天ID缓存
let settings = {};            // 插件设置
let isInitialized = false;    // 初始化标志

/**
 * 获取 SillyTavern 上下文
 */
function getContext() {
    return SillyTavern.getContext();
}

/**
 * 初始化插件设置
 */
function initializeSettings() {
    const { extensionSettings, saveSettingsDebounced } = getContext();
    
    // 初始化设置
    if (!extensionSettings[MODULE_NAME]) {
        extensionSettings[MODULE_NAME] = structuredClone(defaultSettings);
        saveSettingsDebounced();
    }
    
    // 合并默认设置，确保新字段存在
    settings = extensionSettings[MODULE_NAME];
    for (const key of Object.keys(defaultSettings)) {
        if (!Object.hasOwn(settings, key)) {
            settings[key] = defaultSettings[key];
        }
    }
    
    // 确保 saveScope 对象完整
    if (!settings.saveScope) {
        settings.saveScope = structuredClone(defaultSettings.saveScope);
    }
    for (const key of Object.keys(defaultSettings.saveScope)) {
        if (!Object.hasOwn(settings.saveScope, key)) {
            settings.saveScope[key] = defaultSettings.saveScope[key];
        }
    }
    
    console.log(`[${MODULE_NAME}] Settings initialized:`, settings);
}

/**
 * 获取当前聊天ID
 */
function getCurrentChatId() {
    const context = getContext();
    return context.getCurrentChatId();
}

/**
 * 保存配置快照
 */
async function saveSnapshot(chatId = null) {
    if (!chatId) {
        chatId = getCurrentChatId();
    }
    
    if (!chatId) {
        console.debug(`[${MODULE_NAME}] No chat ID available for snapshot`);
        return;
    }
    
    try {
        const snapshot = await captureCurrentConfig();
        if (!snapshot) {
            console.debug(`[${MODULE_NAME}] No config captured for chat ${chatId}`);
            return;
        }
        
        settings.snapshots[chatId] = snapshot;
        
        const { saveSettingsDebounced } = getContext();
        saveSettingsDebounced();
        
        if (!settings.silentMode) {
            toastr.success(`已保存聊天配置快照`);
        }
        
        console.log(`[${MODULE_NAME}] Snapshot saved for chat ${chatId}:`, snapshot);
    } catch (error) {
        console.error(`[${MODULE_NAME}] Error saving snapshot:`, error);
        toastr.error('保存快照失败');
    }
}

/**
 * 恢复配置快照
 */
async function restoreSnapshot(chatId = null) {
    if (!chatId) {
        chatId = getCurrentChatId();
    }
    
    if (!chatId || !settings.snapshots[chatId]) {
        console.debug(`[${MODULE_NAME}] No snapshot found for chat ${chatId}`);
        return;
    }
    
    try {
        const snapshot = settings.snapshots[chatId];
        await applySnapshot(snapshot);
        
        if (!settings.silentMode) {
            toastr.info(`已恢复聊天配置快照`);
        }
        
        console.log(`[${MODULE_NAME}] Snapshot restored for chat ${chatId}:`, snapshot);
    } catch (error) {
        console.error(`[${MODULE_NAME}] Error restoring snapshot:`, error);
        toastr.error('恢复快照失败');
    }
}

/**
 * 捕获当前配置
 */
async function captureCurrentConfig() {
    const context = getContext();
    const snapshot = {
        createdAt: Date.now(),
        messageCount: context.chat ? context.chat.length : 0,
    };
    
    // 捕获预设配置
    if (settings.saveScope.preset) {
        snapshot.preset = await capturePresetConfig();
    }
    
    // 捕获世界书配置
    if (settings.saveScope.worldInfo) {
        snapshot.worldInfo = await captureWorldInfoConfig();
    }
    
    // 捕获正则配置
    if (settings.saveScope.regex) {
        snapshot.regex = await captureRegexConfig();
    }
    
    // 推理模板始终保存
    snapshot.reasoning = await captureReasoningConfig();
    
    return snapshot;
}

/**
 * 应用快照配置
 */
async function applySnapshot(snapshot) {
    if (!snapshot) return;
    
    // 恢复预设配置
    if (snapshot.preset && settings.saveScope.preset) {
        await applyPresetConfig(snapshot.preset);
    }
    
    // 恢复世界书配置
    if (snapshot.worldInfo && settings.saveScope.worldInfo) {
        await applyWorldInfoConfig(snapshot.worldInfo);
    }
    
    // 恢复正则配置
    if (snapshot.regex && settings.saveScope.regex) {
        await applyRegexConfig(snapshot.regex);
    }
    
    // 推理模板始终恢复
    if (snapshot.reasoning) {
        await applyReasoningConfig(snapshot.reasoning);
    }
}

/**
 * 捕获预设配置
 */
async function capturePresetConfig() {
    try {
        const context = getContext();
        const presetManager = context.getPresetManager();
        
        if (!presetManager) {
            console.debug(`[${MODULE_NAME}] No preset manager available`);
            return null;
        }
        
        // 获取当前预设名称
        const currentPresetName = presetManager.getSelectedPresetName();
        if (!currentPresetName) {
            console.debug(`[${MODULE_NAME}] No preset selected`);
            return null;
        }
        
        // 获取预设设置
        const presetSettings = presetManager.getSelectedPreset();
        
        // 获取提示词条目状态（如果可用）
        const promptEntries = {};
        try {
            // 尝试获取提示词管理器的状态
            const promptManagerElement = document.getElementById('prompt_manager_popup');
            if (promptManagerElement) {
                const checkboxes = promptManagerElement.querySelectorAll('input[type="checkbox"]');
                checkboxes.forEach(checkbox => {
                    if (checkbox.id && checkbox.id.startsWith('prompt_') && 'checked' in checkbox) {
                        promptEntries[checkbox.id] = checkbox.checked;
                    }
                });
            }
        } catch (error) {
            console.debug(`[${MODULE_NAME}] Could not capture prompt entries:`, error);
        }
        
        return {
            name: currentPresetName,
            settings: structuredClone(presetSettings || {}),
            promptEntries: promptEntries,
        };
    } catch (error) {
        console.error(`[${MODULE_NAME}] Error capturing preset config:`, error);
        return null;
    }
}

/**
 * 捕获世界书配置
 */
async function captureWorldInfoConfig() {
    try {
        const context = getContext();
        const worldInfoConfig = {
            global: [],
            character: [],
            chat: [],
        };
        
        // 获取全局世界书
        try {
            const globalWorldInfo = context.powerUserSettings?.world_info_settings?.global_select || [];
            worldInfoConfig.global = Array.isArray(globalWorldInfo) ? [...globalWorldInfo] : [];
        } catch (error) {
            console.debug(`[${MODULE_NAME}] Could not capture global world info:`, error);
        }
        
        // 获取角色世界书
        try {
            const characterId = context.characterId;
            if (characterId !== undefined && context.characters[characterId]) {
                const character = context.characters[characterId];
                if (character.data?.character_book) {
                    worldInfoConfig.character = [character.data.character_book.name || 'character_book'];
                }
            }
        } catch (error) {
            console.debug(`[${MODULE_NAME}] Could not capture character world info:`, error);
        }
        
        // 获取聊天世界书
        try {
            const chatMetadata = context.chatMetadata;
            if (chatMetadata?.world_info) {
                worldInfoConfig.chat = Array.isArray(chatMetadata.world_info) ? [...chatMetadata.world_info] : [];
            }
        } catch (error) {
            console.debug(`[${MODULE_NAME}] Could not capture chat world info:`, error);
        }
        
        return worldInfoConfig;
    } catch (error) {
        console.error(`[${MODULE_NAME}] Error capturing world info config:`, error);
        return {
            global: [],
            character: [],
            chat: [],
        };
    }
}

/**
 * 捕获正则配置
 */
async function captureRegexConfig() {
    try {
        const regexConfig = {
            global: {},
            character: {},
        };
        
        // 获取全局正则脚本状态
        try {
            const regexScripts = document.querySelectorAll('#regex_scripts .regex_script_toggle');
            regexScripts.forEach(toggle => {
                if (toggle.id && 'checked' in toggle) {
                    regexConfig.global[toggle.id] = toggle.checked || false;
                }
            });
        } catch (error) {
            console.debug(`[${MODULE_NAME}] Could not capture global regex:`, error);
        }
        
        // 获取角色正则脚本状态
        try {
            const context = getContext();
            const characterId = context.characterId;
            if (characterId !== undefined && context.characters[characterId]) {
                const character = context.characters[characterId];
                if (character.data?.extensions?.regex_scripts) {
                    regexConfig.character = structuredClone(character.data.extensions.regex_scripts);
                }
            }
        } catch (error) {
            console.debug(`[${MODULE_NAME}] Could not capture character regex:`, error);
        }
        
        return regexConfig;
    } catch (error) {
        console.error(`[${MODULE_NAME}] Error capturing regex config:`, error);
        return {
            global: {},
            character: {},
        };
    }
}

/**
 * 捕获推理模板配置
 */
async function captureReasoningConfig() {
    try {
        const context = getContext();
        const reasoning = context.powerUserSettings?.reasoning;
        
        if (!reasoning) {
            console.debug(`[${MODULE_NAME}] No reasoning config available`);
            return {};
        }
        
        return structuredClone(reasoning);
    } catch (error) {
        console.error(`[${MODULE_NAME}] Error capturing reasoning config:`, error);
        return {};
    }
}

/**
 * 应用预设配置
 */
async function applyPresetConfig(presetConfig) {
    try {
        if (!presetConfig || !presetConfig.name) {
            console.debug(`[${MODULE_NAME}] No preset config to apply`);
            return;
        }
        
        const context = getContext();
        const presetManager = context.getPresetManager();
        
        if (!presetManager) {
            console.debug(`[${MODULE_NAME}] No preset manager available`);
            return;
        }
        
        // 切换到指定预设
        try {
            await presetManager.selectPreset(presetConfig.name);
            console.debug(`[${MODULE_NAME}] Switched to preset: ${presetConfig.name}`);
        } catch (error) {
            console.debug(`[${MODULE_NAME}] Could not switch to preset ${presetConfig.name}:`, error);
        }
        
        // 恢复提示词条目状态
        if (presetConfig.promptEntries && Object.keys(presetConfig.promptEntries).length > 0) {
            try {
                // 等待一小段时间确保UI已更新
                await new Promise(resolve => setTimeout(resolve, 100));
                
                Object.entries(presetConfig.promptEntries).forEach(([id, checked]) => {
                    const checkbox = document.getElementById(id);
                    if (checkbox && 'checked' in checkbox) {
                        checkbox.checked = checked;
                        // 触发change事件以确保状态同步
                        checkbox.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                });
                
                console.debug(`[${MODULE_NAME}] Applied prompt entries:`, presetConfig.promptEntries);
            } catch (error) {
                console.debug(`[${MODULE_NAME}] Could not apply prompt entries:`, error);
            }
        }
        
    } catch (error) {
        console.error(`[${MODULE_NAME}] Error applying preset config:`, error);
    }
}

/**
 * 应用世界书配置
 */
async function applyWorldInfoConfig(worldInfoConfig) {
    try {
        if (!worldInfoConfig) {
            console.debug(`[${MODULE_NAME}] No world info config to apply`);
            return;
        }
        
        const context = getContext();
        
        // 应用全局世界书设置
        if (worldInfoConfig.global && Array.isArray(worldInfoConfig.global)) {
            try {
                if (context.powerUserSettings?.world_info_settings) {
                    context.powerUserSettings.world_info_settings.global_select = [...worldInfoConfig.global];
                    console.debug(`[${MODULE_NAME}] Applied global world info:`, worldInfoConfig.global);
                }
            } catch (error) {
                console.debug(`[${MODULE_NAME}] Could not apply global world info:`, error);
            }
        }
        
        // 应用聊天世界书设置
        if (worldInfoConfig.chat && Array.isArray(worldInfoConfig.chat)) {
            try {
                const chatMetadata = context.chatMetadata;
                if (chatMetadata) {
                    chatMetadata.world_info = [...worldInfoConfig.chat];
                    await context.saveMetadata();
                    console.debug(`[${MODULE_NAME}] Applied chat world info:`, worldInfoConfig.chat);
                }
            } catch (error) {
                console.debug(`[${MODULE_NAME}] Could not apply chat world info:`, error);
            }
        }
        
        // 角色世界书通常不需要恢复，因为它绑定在角色卡上
        
    } catch (error) {
        console.error(`[${MODULE_NAME}] Error applying world info config:`, error);
    }
}

/**
 * 应用正则配置
 */
async function applyRegexConfig(regexConfig) {
    try {
        if (!regexConfig) {
            console.debug(`[${MODULE_NAME}] No regex config to apply`);
            return;
        }
        
        // 应用全局正则脚本状态
        if (regexConfig.global && Object.keys(regexConfig.global).length > 0) {
            try {
                // 等待一小段时间确保UI已加载
                await new Promise(resolve => setTimeout(resolve, 100));
                
                Object.entries(regexConfig.global).forEach(([id, checked]) => {
                    const toggle = document.getElementById(id);
                    if (toggle && 'checked' in toggle) {
                        toggle.checked = checked;
                        // 触发change事件以确保状态同步
                        toggle.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                });
                
                console.debug(`[${MODULE_NAME}] Applied global regex:`, regexConfig.global);
            } catch (error) {
                console.debug(`[${MODULE_NAME}] Could not apply global regex:`, error);
            }
        }
        
        // 应用角色正则脚本状态
        if (regexConfig.character && Object.keys(regexConfig.character).length > 0) {
            try {
                const context = getContext();
                const characterId = context.characterId;
                if (characterId !== undefined && context.characters[characterId]) {
                    const character = context.characters[characterId];
                    if (!character.data.extensions) {
                        character.data.extensions = {};
                    }
                    character.data.extensions.regex_scripts = structuredClone(regexConfig.character);
                    
                    // 保存角色数据
                    await context.writeExtensionField(characterId, 'regex_scripts', regexConfig.character);
                    console.debug(`[${MODULE_NAME}] Applied character regex:`, regexConfig.character);
                }
            } catch (error) {
                console.debug(`[${MODULE_NAME}] Could not apply character regex:`, error);
            }
        }
        
    } catch (error) {
        console.error(`[${MODULE_NAME}] Error applying regex config:`, error);
    }
}

/**
 * 应用推理模板配置
 */
async function applyReasoningConfig(reasoningConfig) {
    try {
        if (!reasoningConfig || Object.keys(reasoningConfig).length === 0) {
            console.debug(`[${MODULE_NAME}] No reasoning config to apply`);
            return;
        }
        
        const context = getContext();
        
        if (!context.powerUserSettings) {
            console.debug(`[${MODULE_NAME}] No power user settings available`);
            return;
        }
        
        // 应用推理模板配置
        context.powerUserSettings.reasoning = structuredClone(reasoningConfig);
        
        // 保存设置
        context.saveSettingsDebounced();
        
        // 更新推理UI（如果存在相关函数）
        try {
            if (typeof context.updateReasoningUI === 'function') {
                context.updateReasoningUI(null, null);
            }
        } catch (error) {
            console.debug(`[${MODULE_NAME}] Could not update reasoning UI:`, error);
        }
        
        console.debug(`[${MODULE_NAME}] Applied reasoning config:`, reasoningConfig);
        
    } catch (error) {
        console.error(`[${MODULE_NAME}] Error applying reasoning config:`, error);
    }
}

/**
 * 处理聊天切换事件
 */
async function handleChatChanged() {
    const newChatId = getCurrentChatId();
    
    // 保存旧聊天的快照
    if (currentChatId && settings.autoSave) {
        await saveSnapshot(currentChatId);
    }
    
    // 恢复新聊天的快照
    if (newChatId) {
        await restoreSnapshot(newChatId);
    }
    
    // 更新当前聊天ID缓存
    currentChatId = newChatId;
}

/**
 * 处理消息更新事件（用于更新消息计数）
 */
function handleMessageUpdate() {
    // 消息数量变化时，可以在这里更新缓存
    // 暂时不需要特殊处理
}

/**
 * 添加扩展菜单按钮
 */
function addExtensionButton() {
    const extensionsMenu = document.getElementById('extensionsMenu');
    if (!extensionsMenu) {
        console.error(`[${MODULE_NAME}] Extensions menu not found`);
        return;
    }
    
    const button = document.createElement('div');
    button.id = 'chat-config-snapshot-button';
    button.classList.add('list-group-item', 'flex-container', 'flexGap5', 'interactable');
    button.tabIndex = 0;
    button.title = '立即保存聊天配置快照';
    
    const icon = document.createElement('i');
    icon.className = 'fa-solid fa-camera';
    button.appendChild(icon);
    
    const text = document.createElement('span');
    text.textContent = '保存配置快照';
    button.appendChild(text);
    
    button.addEventListener('click', async () => {
        await saveSnapshot();
    });
    
    extensionsMenu.appendChild(button);
    console.log(`[${MODULE_NAME}] Extension button added`);
}

/**
 * 创建设置面板
 */
async function createSettingsPanel() {
    try {
        const context = getContext();
        const template = await context.renderExtensionTemplateAsync('third-party/chat-config-snapshot', 'template');
        
        if (!template) {
            console.error(`[${MODULE_NAME}] Could not load template`);
            return;
        }
        
        // 设置当前值
        updateSettingsUI(template);
        
        // 绑定事件监听器
        bindSettingsEvents(template);
        
        // 初始化快照列表
        refreshSnapshotList(template);
        
        return template;
    } catch (error) {
        console.error(`[${MODULE_NAME}] Error creating settings panel:`, error);
        return null;
    }
}

/**
 * 更新设置UI
 */
function updateSettingsUI(template) {
    const autoSaveCheckbox = template.find('#chat-config-snapshot-auto-save');
    const silentModeCheckbox = template.find('#chat-config-snapshot-silent-mode');
    const presetScopeCheckbox = template.find('#chat-config-snapshot-scope-preset');
    const worldInfoScopeCheckbox = template.find('#chat-config-snapshot-scope-worldinfo');
    const regexScopeCheckbox = template.find('#chat-config-snapshot-scope-regex');
    
    autoSaveCheckbox.prop('checked', settings.autoSave);
    silentModeCheckbox.prop('checked', settings.silentMode);
    presetScopeCheckbox.prop('checked', settings.saveScope.preset);
    worldInfoScopeCheckbox.prop('checked', settings.saveScope.worldInfo);
    regexScopeCheckbox.prop('checked', settings.saveScope.regex);
}

/**
 * 绑定设置事件
 */
function bindSettingsEvents(template) {
    const context = getContext();
    
    // 自动保存设置
    template.find('#chat-config-snapshot-auto-save').on('change', function() {
        settings.autoSave = $(this).prop('checked');
        context.saveSettingsDebounced();
    });
    
    // 无感模式设置
    template.find('#chat-config-snapshot-silent-mode').on('change', function() {
        settings.silentMode = $(this).prop('checked');
        context.saveSettingsDebounced();
    });
    
    // 保存范围设置
    template.find('#chat-config-snapshot-scope-preset').on('change', function() {
        settings.saveScope.preset = $(this).prop('checked');
        context.saveSettingsDebounced();
    });
    
    template.find('#chat-config-snapshot-scope-worldinfo').on('change', function() {
        settings.saveScope.worldInfo = $(this).prop('checked');
        context.saveSettingsDebounced();
    });
    
    template.find('#chat-config-snapshot-scope-regex').on('change', function() {
        settings.saveScope.regex = $(this).prop('checked');
        context.saveSettingsDebounced();
    });
    
    // 刷新列表按钮
    template.find('#chat-config-snapshot-refresh-list').on('click', function() {
        refreshSnapshotList(template);
    });
    
    // 清空所有快照按钮
    template.find('#chat-config-snapshot-clear-all').on('click', async function() {
        const confirmed = await context.Popup.show.confirm('确认清空', '确定要删除所有快照吗？此操作不可撤销。');
        if (confirmed) {
            settings.snapshots = {};
            context.saveSettingsDebounced();
            refreshSnapshotList(template);
            toastr.success('已清空所有快照');
        }
    });
}

/**
 * 刷新快照列表
 */
function refreshSnapshotList(template) {
    const listContainer = template.find('#chat-config-snapshot-list');
    listContainer.empty();
    
    const snapshots = settings.snapshots;
    const snapshotKeys = Object.keys(snapshots);
    
    if (snapshotKeys.length === 0) {
        listContainer.append('<div class="justifyCenter"><small>暂无快照</small></div>');
        return;
    }
    
    // 按创建时间排序
    snapshotKeys.sort((a, b) => {
        const timeA = snapshots[a].createdAt || 0;
        const timeB = snapshots[b].createdAt || 0;
        return timeB - timeA; // 新的在前
    });
    
    snapshotKeys.forEach(chatId => {
        const snapshot = snapshots[chatId];
        const snapshotElement = createSnapshotListItem(chatId, snapshot, template);
        listContainer.append(snapshotElement);
    });
}

/**
 * 创建快照列表项
 */
function createSnapshotListItem(chatId, snapshot, template) {
    const context = getContext();
    const createdDate = new Date(snapshot.createdAt || 0).toLocaleString();
    const messageCount = snapshot.messageCount || 0;
    
    // 获取预设名称
    const presetName = snapshot.preset?.name || '未知';
    
    const item = $(`
        <div class="snapshot-item">
            <div class="snapshot-header">
                <div class="snapshot-title">聊天 ID: ${chatId}</div>
                <div class="snapshot-date">${createdDate}</div>
            </div>
            <div class="snapshot-info">
                预设: ${presetName} | 消息数: ${messageCount}
            </div>
            <div class="snapshot-actions">
                <div class="snapshot-action-btn" data-action="view">查看详情</div>
                <div class="snapshot-action-btn" data-action="restore">恢复快照</div>
                <div class="snapshot-action-btn danger" data-action="delete">删除</div>
            </div>
        </div>
    `);
    
    // 绑定操作事件
    item.find('[data-action="view"]').on('click', (e) => {
        e.stopPropagation();
        showSnapshotDetail(chatId, snapshot);
    });
    
    item.find('[data-action="restore"]').on('click', async (e) => {
        e.stopPropagation();
        await applySnapshot(snapshot);
        toastr.success('快照已恢复到当前聊天');
    });
    
    item.find('[data-action="delete"]').on('click', async (e) => {
        e.stopPropagation();
        const confirmed = await context.Popup.show.confirm('确认删除', `确定要删除聊天 ${chatId} 的快照吗？`);
        if (confirmed) {
            delete settings.snapshots[chatId];
            context.saveSettingsDebounced();
            refreshSnapshotList(template);
            toastr.success('快照已删除');
        }
    });
    
    return item;
}

/**
 * 显示快照详情
 */
async function showSnapshotDetail(chatId, snapshot) {
    const context = getContext();
    const detailTemplate = $('#chat-config-snapshot-detail-template').clone();
    detailTemplate.show();
    
    // 填充基本信息
    const createdDate = new Date(snapshot.createdAt || 0).toLocaleString();
    detailTemplate.find('.snapshot-created-at').text(createdDate);
    detailTemplate.find('.snapshot-message-count').text(snapshot.messageCount || 0);
    
    // 填充预设信息
    if (snapshot.preset) {
        const presetInfo = detailTemplate.find('#snapshot-preset-info');
        presetInfo.show();
        presetInfo.find('.snapshot-preset-name').text(snapshot.preset.name || '未知');
        
        const promptEntries = snapshot.preset.promptEntries || {};
        const enabledEntries = Object.entries(promptEntries).filter(([_, enabled]) => enabled).length;
        const totalEntries = Object.keys(promptEntries).length;
        presetInfo.find('.snapshot-prompt-entries').text(`${enabledEntries}/${totalEntries} 已启用`);
    }
    
    // 填充世界书信息
    if (snapshot.worldInfo) {
        const worldInfoInfo = detailTemplate.find('#snapshot-worldinfo-info');
        worldInfoInfo.show();
        worldInfoInfo.find('.snapshot-worldinfo-global').text(snapshot.worldInfo.global?.length || 0);
        worldInfoInfo.find('.snapshot-worldinfo-character').text(snapshot.worldInfo.character?.length || 0);
        worldInfoInfo.find('.snapshot-worldinfo-chat').text(snapshot.worldInfo.chat?.length || 0);
    }
    
    // 填充正则信息
    if (snapshot.regex) {
        const regexInfo = detailTemplate.find('#snapshot-regex-info');
        regexInfo.show();
        
        const globalEnabled = Object.values(snapshot.regex.global || {}).filter(Boolean).length;
        const globalTotal = Object.keys(snapshot.regex.global || {}).length;
        regexInfo.find('.snapshot-regex-global').text(`${globalEnabled}/${globalTotal} 已启用`);
        
        const characterEnabled = Object.values(snapshot.regex.character || {}).filter(Boolean).length;
        const characterTotal = Object.keys(snapshot.regex.character || {}).length;
        regexInfo.find('.snapshot-regex-character').text(`${characterEnabled}/${characterTotal} 已启用`);
    }
    
    // 显示弹窗
    await context.Popup.show.text(`快照详情 - 聊天 ${chatId}`, detailTemplate.html());
}

/**
 * 注册设置面板
 */
function registerSettingsPanel() {
    const context = getContext();
    
    // 添加到扩展设置中（如果需要的话）
    
    // 创建设置按钮
    const settingsButton = document.createElement('div');
    settingsButton.id = 'chat-config-snapshot-settings-button';
    settingsButton.classList.add('list-group-item', 'flex-container', 'flexGap5', 'interactable');
    settingsButton.tabIndex = 0;
    settingsButton.title = '聊天配置快照设置';
    
    const icon = document.createElement('i');
    icon.className = 'fa-solid fa-cog';
    settingsButton.appendChild(icon);
    
    const text = document.createElement('span');
    text.textContent = '快照设置';
    settingsButton.appendChild(text);
    
    settingsButton.addEventListener('click', async () => {
        const settingsPanel = await createSettingsPanel();
        if (settingsPanel) {
            await context.Popup.show.text('聊天配置快照设置', settingsPanel, { wide: true, large: true });
        }
    });
    
    const extensionsMenu = document.getElementById('extensionsMenu');
    if (extensionsMenu) {
        extensionsMenu.appendChild(settingsButton);
        console.log(`[${MODULE_NAME}] Settings button added`);
    }
}

/**
 * 注册事件监听器
 */
function registerEventListeners() {
    const { eventSource, eventTypes } = getContext();
    
    // 监听聊天切换事件
    eventSource.on(eventTypes.CHAT_CHANGED, handleChatChanged);
    
    // 监听消息相关事件
    eventSource.on(eventTypes.MESSAGE_SENT, handleMessageUpdate);
    eventSource.on(eventTypes.MESSAGE_RECEIVED, handleMessageUpdate);
    
    console.log(`[${MODULE_NAME}] Event listeners registered`);
}

/**
 * 插件初始化
 */
function initialize() {
    if (isInitialized) {
        console.warn(`[${MODULE_NAME}] Already initialized`);
        return;
    }
    
    try {
        // 初始化设置
        initializeSettings();
        
        // 注册事件监听器
        registerEventListeners();
        
        // 添加扩展按钮
        addExtensionButton();
        
        // 注册设置面板
        registerSettingsPanel();
        
        // 设置当前聊天ID
        currentChatId = getCurrentChatId();
        
        isInitialized = true;
        console.log(`[${MODULE_NAME}] Extension initialized successfully`);
        
        // 如果当前有聊天，尝试恢复快照
        if (currentChatId) {
            restoreSnapshot(currentChatId);
        }
        
    } catch (error) {
        console.error(`[${MODULE_NAME}] Initialization failed:`, error);
        toastr.error('聊天配置快照插件初始化失败');
    }
}

// 等待应用就绪后初始化
const { eventSource, eventTypes } = getContext();
eventSource.on(eventTypes.APP_READY, initialize);

console.log(`[${MODULE_NAME}] Extension loaded, waiting for app ready...`);