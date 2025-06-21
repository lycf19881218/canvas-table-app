class CanvasTable {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        
        // 设置Canvas为完整视口尺寸
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        
        // 表格配置
        this.rows = 20; // 固定行数
        this.cols = 10;
        this.cellWidth = 150;
        
        // 根据屏幕高度自适应计算行高和表头高度
        this.headerHeight = this.canvas.height * 0.05; // 表头占屏幕高度的5%
        this.cellHeight = (this.canvas.height - this.headerHeight) / this.rows;
        
        // 计算水平居中偏移，垂直从顶部开始
        this.offsetX = (this.canvas.width - this.cols * this.cellWidth) / 2;
        this.offsetY = 0;
        
        // 样式配置
        this.borderColor = '#333';
        this.headerBgColor = '#4a90e2';
        this.headerTextColor = '#fff';
        this.cellBgColor = '#fff';
        this.altRowBgColor = '#f8f9fa';
        this.textColor = '#333';
        this.fontSize = Math.max(10, Math.floor(this.cellHeight * 0.3)); // 减小字体大小
        
        // 表格数据
        this.data = this.generateEmptyData();
        this.headers = this.generateColumnHeaders();
        
        // 创建背景层离屏Canvas
        this.backgroundCanvas = document.createElement('canvas');
        this.backgroundCanvas.width = this.canvas.width;
        this.backgroundCanvas.height = this.canvas.height;
        this.backgroundCtx = this.backgroundCanvas.getContext('2d');
        
        // 创建数据层离屏Canvas
        this.dataCanvas = document.createElement('canvas');
        this.dataCanvas.width = this.canvas.width;
        this.dataCanvas.height = this.canvas.height;
        this.dataCtx = this.dataCanvas.getContext('2d');
        
        // 创建编辑层离屏Canvas
        this.editCanvas = document.createElement('canvas');
        this.editCanvas.width = this.canvas.width;
        this.editCanvas.height = this.canvas.height;
        this.editCtx = this.editCanvas.getContext('2d');
        
        // 缓存标志
        this.backgroundDrawn = false;
        this.dataDrawn = false;
        
        // 交互状态
        this.selectedCell = null;
        this.isComposing = false; // 输入法组合状态
        
        // 事件优化
        this.cellCache = new Map(); // 坐标到单元格的缓存
        this.boundingRect = null; // 缓存的边界矩形
        this.lastCacheUpdate = 0;
        
        // 渲染优化
        this.batchRenderQueue = []; // 批量渲染队列
        this.isRenderingBatch = false; // 是否正在批量渲染
        this.renderBatchSize = 50; // 批量渲染大小
        
        // Canvas操作缓存
        this.canvasStateCache = {
            lastFont: null,
            lastFillStyle: null,
            lastTextAlign: null,
            lastTextBaseline: null
        };
        
        // 内存池优化：预分配对象池，减少GC压力
        this.objectPools = {
            drawOperations: [],
            lineInfos: [],
            points: []
        };
        
        // 预分配对象池
        this.initializeObjectPools();
        
        
        // 创建字符纹理图集
        this.createFontAtlas();
        
        // 性能优化 - 脏区域渲染
        this.needsRedraw = true;
        this.dirtyRegions = new Set(); // 需要重绘的区域
        this.lastDrawTime = 0;
        this.frameThrottle = 16.67; // 60fps限制
        
        // 防抖绘制优化
        this.drawDebounceTimer = null;
        this.drawDebounceDelay = 16; // 16ms防抖，约60fps
        
        // 输入控件引用（只保留日期选择器）
        this.datePicker = document.getElementById('datePicker');
        
        // 创建自定义日期控件
        this.createCustomDatePicker();
        
        // 创建数字键盘控件
        this.createNumberPad();
        
        // 内联编辑状态
        this.editingCell = null;
        this.editingText = '';
        this.cursorPosition = 0;
        this.cursorVisible = true;
        this.cursorBlinkTimer = null;
        
        this.init();
    }
    
    // 初始化对象池
    initializeObjectPools() {
        // 预分配绘制操作对象
        for (var i = 0; i < 1000; i++) {
            this.objectPools.drawOperations.push({
                sx: 0, sy: 0, sw: 0, sh: 0,
                dx: 0, dy: 0, dw: 0, dh: 0
            });
        }
        
        // 预分配行信息对象
        for (var i = 0; i < 50; i++) {
            this.objectPools.lineInfos.push({
                text: '',
                width: 0,
                startX: 0,
                y: 0
            });
        }
    }
    
    // 从对象池获取对象
    getPooledObject(poolName) {
        var pool = this.objectPools[poolName];
        if (pool && pool.length > 0) {
            return pool.pop();
        }
        
        // 池空了，创建新对象（性能回退）
        switch(poolName) {
            case 'drawOperations':
                return { sx: 0, sy: 0, sw: 0, sh: 0, dx: 0, dy: 0, dw: 0, dh: 0 };
            case 'lineInfos':
                return { text: '', width: 0, startX: 0, y: 0 };
            default:
                return {};
        }
    }
    
    // 将对象归还到池中
    returnPooledObject(poolName, obj) {
        var pool = this.objectPools[poolName];
        if (pool && pool.length < 1000) { // 限制池大小
            // 清理对象属性
            if (poolName === 'drawOperations') {
                obj.sx = obj.sy = obj.sw = obj.sh = 0;
                obj.dx = obj.dy = obj.dw = obj.dh = 0;
            } else if (poolName === 'lineInfos') {
                obj.text = '';
                obj.width = obj.startX = obj.y = 0;
            }
            
            pool.push(obj);
        }
    }
    
    // 创建自定义日期控件
    createCustomDatePicker() {
        // 创建日期控件容器
        this.customDatePicker = document.createElement('div');
        this.customDatePicker.className = 'custom-date-picker';
        this.customDatePicker.style.cssText = `
            position: absolute;
            display: none;
            background: white;
            border: 2px solid #007bff;
            border-radius: 6px;
            padding: 10px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 2000;
            width: 240px;
            font-family: Arial, sans-serif;
        `;
        
        // 创建导航栏 - << < 2025/06 > >>
        const navBar = document.createElement('div');
        navBar.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 10px;
            user-select: none;
        `;
        
        // 左侧按钮容器
        const leftButtons = document.createElement('div');
        leftButtons.style.cssText = 'display: flex; gap: 2px;';
        
        // 快速向前按钮 (<<)
        this.prevYearBtn = document.createElement('button');
        this.prevYearBtn.textContent = '<<';
        this.prevYearBtn.style.cssText = `
            padding: 6px 10px;
            background: transparent;
            border: none;
            cursor: pointer;
            font-size: 13px;
            color: #666;
            border-radius: 4px;
            transition: all 0.2s ease;
            min-width: 30px;
            min-height: 28px;
        `;
        
        // 向前按钮 (<)
        this.prevMonthBtn = document.createElement('button');
        this.prevMonthBtn.textContent = '<';
        this.prevMonthBtn.style.cssText = `
            padding: 6px 10px;
            background: transparent;
            border: none;
            cursor: pointer;
            font-size: 13px;
            color: #666;
            border-radius: 4px;
            transition: all 0.2s ease;
            min-width: 30px;
            min-height: 28px;
        `;
        
        leftButtons.appendChild(this.prevYearBtn);
        leftButtons.appendChild(this.prevMonthBtn);
        
        // 中间显示当前年月
        this.currentYearMonth = document.createElement('span');
        this.currentYearMonth.style.cssText = `
            font-weight: bold;
            font-size: 14px;
            color: #333;
            min-width: 70px;
            text-align: center;
        `;
        
        // 右侧按钮容器
        const rightButtons = document.createElement('div');
        rightButtons.style.cssText = 'display: flex; gap: 2px;';
        
        // 向后按钮 (>)
        this.nextMonthBtn = document.createElement('button');
        this.nextMonthBtn.textContent = '>';
        this.nextMonthBtn.style.cssText = `
            padding: 6px 10px;
            background: transparent;
            border: none;
            cursor: pointer;
            font-size: 13px;
            color: #666;
            border-radius: 4px;
            transition: all 0.2s ease;
            min-width: 30px;
            min-height: 28px;
        `;
        
        // 快速向后按钮 (>>)
        this.nextYearBtn = document.createElement('button');
        this.nextYearBtn.textContent = '>>';
        this.nextYearBtn.style.cssText = `
            padding: 6px 10px;
            background: transparent;
            border: none;
            cursor: pointer;
            font-size: 13px;
            color: #666;
            border-radius: 4px;
            transition: all 0.2s ease;
            min-width: 30px;
            min-height: 28px;
        `;
        
        rightButtons.appendChild(this.nextMonthBtn);
        rightButtons.appendChild(this.nextYearBtn);
        
        // 组装导航栏
        navBar.appendChild(leftButtons);
        navBar.appendChild(this.currentYearMonth);
        navBar.appendChild(rightButtons);
        
        // 创建日期网格
        this.dateGrid = document.createElement('div');
        this.dateGrid.style.cssText = `
            display: grid;
            grid-template-columns: repeat(7, 1fr);
            gap: 0;
        `;
        
        // 创建星期标题
        const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
        weekdays.forEach(day => {
            const dayHeader = document.createElement('div');
            dayHeader.textContent = day;
            dayHeader.style.cssText = `
                text-align: center;
                padding: 6px 4px;
                font-weight: bold;
                background: transparent;
                font-size: 11px;
                color: #999;
            `;
            this.dateGrid.appendChild(dayHeader);
        });
        
        // 组装控件
        this.customDatePicker.appendChild(navBar);
        this.customDatePicker.appendChild(this.dateGrid);
        
        // 添加到页面
        document.body.appendChild(this.customDatePicker);
        
        // 初始化当前年月
        const now = new Date();
        this.currentYear = now.getFullYear();
        this.currentMonth = now.getMonth() + 1;
        
        // 绑定事件
        this.bindDatePickerEvents();
        
        // 初始化显示
        this.updateDateGrid();
    }
    
    // 创建数字键盘控件
    createNumberPad() {
        // 创建数字键盘容器
        this.numberPad = document.createElement('div');
        this.numberPad.className = 'number-pad';
        this.numberPad.style.cssText = `
            position: absolute;
            display: none;
            background: white;
            border: 2px solid #007bff;
            border-radius: 6px;
            padding: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 2000;
            width: 140px;
            font-family: Arial, sans-serif;
            user-select: none;
        `;
        
        // 创建数字键盘网格
        const numberGrid = document.createElement('div');
        numberGrid.style.cssText = `
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 6px;
        `;
        
        // 数字键盘布局：1-9，0，删除
        const keys = [
            '1', '2', '3',
            '4', '5', '6', 
            '7', '8', '9',
            '', '0', '⌫'
        ];
        
        // 创建按键
        keys.forEach(key => {
            const button = document.createElement('button');
            
            // 空按钮（占位用）
            if (key === '') {
                button.style.cssText = `
                    padding: 8px;
                    background: transparent;
                    border: none;
                    min-height: 35px;
                    cursor: default;
                `;
                numberGrid.appendChild(button);
                return;
            }
            
            button.textContent = key;
            button.style.cssText = `
                padding: 8px;
                background: #f8f9fa;
                border: 1px solid #dee2e6;
                border-radius: 4px;
                cursor: pointer;
                font-size: 14px;
                font-weight: 500;
                color: #333;
                transition: all 0.2s ease;
                min-height: 35px;
                display: flex;
                align-items: center;
                justify-content: center;
            `;
            
            // 删除按钮特殊样式
            if (key === '⌫') {
                button.style.background = '#dc3545';
                button.style.color = 'white';
                button.style.fontSize = '12px';
            }
            
            // 点击事件（增强版事件隔离）
            const self = this;
            button.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation(); // 阻止所有事件传播
                
                // 直接同步执行，避免时序竞争问题
                self.handleNumberPadClick(key);
            });
            
            // 悬停效果
            button.addEventListener('mouseenter', function() {
                if (key === '⌫') {
                    this.style.background = '#c82333';
                } else {
                    this.style.background = '#e9ecef';
                    this.style.transform = 'scale(1.05)';
                }
            });
            
            button.addEventListener('mouseleave', function() {
                if (key === '⌫') {
                    this.style.background = '#dc3545';
                } else {
                    this.style.background = '#f8f9fa';
                    this.style.transform = 'scale(1)';
                }
            });
            
            numberGrid.appendChild(button);
        });
        
        // 组装控件（只有数字键盘，没有确认取消按钮）
        this.numberPad.appendChild(numberGrid);
        
        // 添加到页面
        document.body.appendChild(this.numberPad);
        
        // 初始化数字输入状态
        this.numberInputText = '';
        
        // 阻止数字键盘容器背景点击事件冒泡（关键修复）
        this.numberPad.addEventListener('click', function(e) {
            // 如果点击的不是按钮，阻止事件冒泡到document
            if (e.target === this || !e.target.tagName || e.target.tagName !== 'BUTTON') {
                e.stopPropagation();
                e.preventDefault();
            }
        });
        
        // 移除了多余的document点击处理器，统一由setupEventListeners()处理
    }
    
    // 绑定日期控件事件
    bindDatePickerEvents() {
        const self = this;
        
        // 上一年按钮
        this.prevYearBtn.addEventListener('click', function() {
            self.currentYear--;
            self.updateDateGrid();
        });
        this.prevYearBtn.addEventListener('mouseenter', function() {
            this.style.background = '#e3f2fd';
            this.style.color = '#1976d2';
            this.style.transform = 'scale(1.05)';
        });
        this.prevYearBtn.addEventListener('mouseleave', function() {
            this.style.background = 'transparent';
            this.style.color = '#666';
            this.style.transform = 'scale(1)';
        });
        
        // 上一月按钮
        this.prevMonthBtn.addEventListener('click', function() {
            self.currentMonth--;
            if (self.currentMonth < 1) {
                self.currentMonth = 12;
                self.currentYear--;
            }
            self.updateDateGrid();
        });
        this.prevMonthBtn.addEventListener('mouseenter', function() {
            this.style.background = '#e3f2fd';
            this.style.color = '#1976d2';
            this.style.transform = 'scale(1.05)';
        });
        this.prevMonthBtn.addEventListener('mouseleave', function() {
            this.style.background = 'transparent';
            this.style.color = '#666';
            this.style.transform = 'scale(1)';
        });
        
        // 下一月按钮
        this.nextMonthBtn.addEventListener('click', function() {
            self.currentMonth++;
            if (self.currentMonth > 12) {
                self.currentMonth = 1;
                self.currentYear++;
            }
            self.updateDateGrid();
        });
        this.nextMonthBtn.addEventListener('mouseenter', function() {
            this.style.background = '#e3f2fd';
            this.style.color = '#1976d2';
            this.style.transform = 'scale(1.05)';
        });
        this.nextMonthBtn.addEventListener('mouseleave', function() {
            this.style.background = 'transparent';
            this.style.color = '#666';
            this.style.transform = 'scale(1)';
        });
        
        // 下一年按钮
        this.nextYearBtn.addEventListener('click', function() {
            self.currentYear++;
            self.updateDateGrid();
        });
        this.nextYearBtn.addEventListener('mouseenter', function() {
            this.style.background = '#e3f2fd';
            this.style.color = '#1976d2';
            this.style.transform = 'scale(1.05)';
        });
        this.nextYearBtn.addEventListener('mouseleave', function() {
            this.style.background = 'transparent';
            this.style.color = '#666';
            this.style.transform = 'scale(1)';
        });
        
        // 点击控件外部关闭
        document.addEventListener('click', function(e) {
            // 检查点击是否在日期控件内部，包括所有子元素
            let isInsideDatePicker = self.customDatePicker.contains(e.target);
            
            // 额外检查：如果点击的是日期控件的按钮或子元素
            if (!isInsideDatePicker && e.target) {
                let element = e.target;
                // 向上遍历DOM树检查是否在日期控件内
                while (element && element !== document.body) {
                    if (element === self.customDatePicker) {
                        isInsideDatePicker = true;
                        break;
                    }
                    element = element.parentElement;
                }
            }
            
            if (!isInsideDatePicker && !self.canvas.contains(e.target)) {
                self.hideCustomDatePicker();
            }
        });
    }
    
    // 更新日期网格
    updateDateGrid() {
        // 更新导航栏显示
        this.currentYearMonth.textContent = `${this.currentYear}/${this.currentMonth.toString().padStart(2, '0')}`;
        
        // 清除现有日期格子（保留星期标题）
        const existingDates = this.dateGrid.querySelectorAll('.date-cell');
        existingDates.forEach(cell => cell.remove());
        
        // 获取月份信息
        const firstDay = new Date(this.currentYear, this.currentMonth - 1, 1);
        const lastDay = new Date(this.currentYear, this.currentMonth, 0);
        const daysInMonth = lastDay.getDate();
        const startWeekday = firstDay.getDay(); // 0=星期日
        
        // 添加空白格子
        for (let i = 0; i < startWeekday; i++) {
            const emptyCell = document.createElement('div');
            emptyCell.className = 'date-cell';
            emptyCell.style.cssText = 'background: transparent;';
            this.dateGrid.appendChild(emptyCell);
        }
        
        // 添加日期格子
        for (let day = 1; day <= daysInMonth; day++) {
            const dateCell = document.createElement('div');
            dateCell.className = 'date-cell';
            dateCell.textContent = day;
            dateCell.style.cssText = `
                text-align: center;
                padding: 6px 4px;
                cursor: pointer;
                background: transparent;
                transition: background-color 0.2s;
                font-size: 12px;
                color: #333;
                border-radius: 3px;
            `;
            
            // 今天高亮
            const today = new Date();
            const isToday = this.currentYear === today.getFullYear() && 
                           this.currentMonth === today.getMonth() + 1 && 
                           day === today.getDate();
            
            if (isToday) {
                dateCell.style.color = '#1976d2';
                dateCell.style.fontWeight = 'bold';
            }
            
            // 点击事件 - 点击直接选择并关闭
            const self = this;
            dateCell.addEventListener('click', function() {
                self.selectDateAndClose(day);
            });
            
            // 悬停效果
            dateCell.addEventListener('mouseenter', function() {
                this.style.background = '#f0f0f0'; // 淡淡的灰色
            });
            
            dateCell.addEventListener('mouseleave', function() {
                this.style.background = 'transparent';
            });
            
            this.dateGrid.appendChild(dateCell);
        }
        
        // 重置选中状态
        this.selectedDateCell = null;
    }
    
    // 选择日期并关闭控件
    selectDateAndClose(day) {
        if (this.editingCell) {
            const year = this.currentYear;
            const month = this.currentMonth.toString().padStart(2, '0');
            const dayStr = day.toString().padStart(2, '0');
            const dateString = `${year}-${month}-${dayStr}`;
            
            this.updateCellData(this.editingCell.row, this.editingCell.col, dateString);
        }
        this.hideCustomDatePicker();
    }
    
    // 显示自定义日期控件
    showCustomDatePicker(cell) {
        // 隐藏数字键盘但不保存数据
        if (this.numberPad.style.display !== 'none') {
            this.hideNumberPad(false);
        }
        this.editingCell = cell;
        
        // 解析现有日期值
        const currentValue = this.data[cell.row] ? this.data[cell.row][cell.col] || '' : '';
        if (currentValue && /^\d{4}-\d{2}-\d{2}$/.test(currentValue)) {
            const dateParts = currentValue.split('-');
            this.currentYear = parseInt(dateParts[0]);
            this.currentMonth = parseInt(dateParts[1]);
            this.updateDateGrid();
        } else {
            // 默认显示当前日期
            const today = new Date();
            this.currentYear = today.getFullYear();
            this.currentMonth = today.getMonth() + 1;
            this.updateDateGrid();
        }
        
        // 计算位置（显示在单元格下方）
        const cellX = this.offsetX + cell.col * this.cellWidth;
        const cellY = this.offsetY + this.headerHeight + cell.row * this.cellHeight + this.cellHeight;
        
        // 调整位置确保不超出屏幕
        const rect = this.canvas.getBoundingClientRect();
        let finalX = rect.left + cellX;
        let finalY = rect.top + cellY; // 紧贴单元格底部
        
        // 防止超出屏幕右侧
        if (finalX + 240 > window.innerWidth) {
            finalX = window.innerWidth - 250;
        }
        
        // 防止超出屏幕底部
        if (finalY + 200 > window.innerHeight) {
            finalY = rect.top + this.offsetY + this.headerHeight + cell.row * this.cellHeight - 195; // 显示在上方，调整距离
        }
        
        this.customDatePicker.style.left = finalX + 'px';
        this.customDatePicker.style.top = finalY + 'px';
        this.customDatePicker.style.display = 'block';
    }
    
    // 隐藏自定义日期控件
    hideCustomDatePicker() {
        this.customDatePicker.style.display = 'none';
        this.editingCell = null;
        // 清除日期单元格的键盘监听
        this.removeDateCellKeyListener();
    }
    
    // 处理数字键盘点击
    handleNumberPadClick(key) {
        console.log('🔥 数字键盘点击事件:', key, '编辑单元格:', this.editingCell);
        
        if (!this.editingCell) {
            console.warn('❌ No editing cell found for number pad click');
            return;
        }
        
        // 确保 numberInputText 已初始化
        if (this.numberInputText === undefined || this.numberInputText === null) {
            this.numberInputText = '';
        }
        
        console.log('📝 点击前文本:', this.numberInputText, '长度:', this.numberInputText.length);
        
        if (key === '⌫') {
            // 删除最后一个字符 - 增强版处理
            if (this.numberInputText && this.numberInputText.length > 0) {
                this.numberInputText = this.numberInputText.slice(0, -1);
                console.log('🗑️ 删除操作完成，剩余文本:', this.numberInputText);
            } else {
                console.log('⚠️ 没有字符可删除');
            }
        } else {
            // 添加数字 - 移除长度限制
            this.numberInputText += key;
            console.log('➕ 添加数字:', key);
            
            // 检查字符是否在字符图集中
            if (!this.charMap[key]) {
                console.warn('⚠️ 字符不在字符图集中:', key);
                this.addCharToAtlas(key);
            }
        }
        
        console.log('✅ 点击后文本:', this.numberInputText, '长度:', this.numberInputText.length);
        
        // 只更新显示状态，不立即保存到数据中
        this.editingText = this.numberInputText;
        this.cursorPosition = this.numberInputText.length;
        
        // 验证状态同步
        console.log('🔄 状态同步检查:');
        console.log('   numberInputText:', this.numberInputText);
        console.log('   editingText:', this.editingText);
        console.log('   cursorPosition:', this.cursorPosition);
        
        this.needsRedraw = true;
        this.draw();
        
        console.log('🎯 完成数字键盘处理');
    }
    
    // 确认数字输入
    confirmNumberInput() {
        if (this.editingCell) {
            this.updateCellData(this.editingCell.row, this.editingCell.col, this.numberInputText);
        }
        this.hideNumberPad();
    }
    
    // 显示数字键盘
    showNumberPad(cell) {
        console.log('🚀 显示数字键盘，单元格:', cell);
        
        // 只隐藏其他控件，不结束编辑状态
        this.hideCustomDatePicker(); // 隐藏日期控件
        this.stopCursorBlink(); // 停止光标闪烁
        this.editingCell = cell;
        
        // 获取现有值
        const currentValue = this.data[cell.row] ? this.data[cell.row][cell.col] || '' : '';
        this.numberInputText = currentValue;
        this.editingText = currentValue;
        this.cursorPosition = currentValue.length;
        
        console.log('💾 初始化状态 - 当前值:', currentValue, '编辑单元格:', this.editingCell);
        
        // 计算位置（显示在单元格下方）
        const cellX = this.offsetX + cell.col * this.cellWidth;
        const cellY = this.offsetY + this.headerHeight + cell.row * this.cellHeight + this.cellHeight;
        
        // 调整位置确保不超出屏幕
        const rect = this.canvas.getBoundingClientRect();
        let finalX = rect.left + cellX;
        let finalY = rect.top + cellY; // 紧贴单元格底部
        
        // 防止超出屏幕右侧
        if (finalX + 140 > window.innerWidth) {
            finalX = window.innerWidth - 150;
        }
        
        // 防止超出屏幕底部
        if (finalY + 160 > window.innerHeight) {
            finalY = rect.top + this.offsetY + this.headerHeight + cell.row * this.cellHeight - 170; // 显示在上方
        }
        
        this.numberPad.style.left = finalX + 'px';
        this.numberPad.style.top = finalY + 'px';
        this.numberPad.style.display = 'block';
        
        // 开始编辑状态
        this.needsRedraw = true;
        this.draw();
    }
    
    // 隐藏数字键盘
    hideNumberPad(saveData = true) {
        // 只在明确要求时保存数据
        if (saveData && this.editingCell && this.numberInputText !== undefined) {
            this.updateCellData(this.editingCell.row, this.editingCell.col, this.numberInputText);
        }
        
        this.numberPad.style.display = 'none';
        this.editingCell = null;
        this.editingText = '';
        this.numberInputText = '';
        this.cursorPosition = 0;
        this.needsRedraw = true;
        this.draw();
    }
    
    // 为日期单元格设置键盘监听
    setupDateCellKeyListener(cell) {
        this.removeDateCellKeyListener(); // 先清除之前的监听
        
        const self = this;
        this.dateKeyListener = function(e) {
            if (e.key === 'Backspace' || e.key === 'Delete') {
                // 删除日期
                self.updateCellData(cell.row, cell.col, '');
                self.hideCustomDatePicker();
                e.preventDefault();
            } else if (e.key === 'Escape') {
                // 取消编辑
                self.hideCustomDatePicker();
                e.preventDefault();
            }
        };
        
        document.addEventListener('keydown', this.dateKeyListener);
        
        // 给body焦点以便接收键盘事件
        document.body.focus();
    }
    
    // 清除日期单元格的键盘监听
    removeDateCellKeyListener() {
        if (this.dateKeyListener) {
            document.removeEventListener('keydown', this.dateKeyListener);
            this.dateKeyListener = null;
        }
    }
    
    init() {
        try {
            this.drawBackgroundLayer();
            this.drawDataLayer();
            this.draw();
            this.addEventListeners();
            this.initInputControls();
            
            // 强制重新绘制以应用间距设置
            this.dataDrawn = false;
            this.needsRedraw = true;
            this.drawDataLayer();
            this.draw();
            
            console.log('间距设置已应用 - ASCII间距:', this.ASCII_SPACING, 'CJK间距:', this.CJK_SPACING);
        } catch (error) {
            console.error('Canvas表格初始化失败:', error);
            throw error;
        }
    }
    
    generateEmptyData() {
        const emptyData = [];
        for (let row = 0; row < this.rows; row++) {
            emptyData.push(new Array(this.cols).fill(''));
        }
        return emptyData;
    }
    
    generateColumnHeaders() {
        const headers = ['序号', '姓名', '年龄', '职位', '部门', '工资', '入职时间', '联系方式', '地址', '备注'];
        // 如果列数超过预设，继续用英文
        for (let col = headers.length; col < this.cols; col++) {
            headers.push('Column ' + (col + 1));
        }
        return headers;
    }
    
    // 创建字符纹理图集
    createFontAtlas() {
        // 定义字符集（清理版本，避免特殊符号问题）
        // 基础字符集：数字、字母、基本标点
        var basicChars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz .,()-+%$#@!?:;=*&_';
        // 安全的特殊字符（避免转义问题）
        var specialChars = '"\'[]{}';
        // 中文标点
        var chineseChars = '，。！？；：【】（）';
        
        // 完整字符集：一次性加载所有常用字符
        this.charset = basicChars + specialChars + chineseChars +
                      // 完整的3500+常用汉字，一次性预加载
                      '的一是在不了有和人这中大为上个国我以要他时来用们生到作地于出就分对成会可主发年动同工也能下过子说产种面而方后多定行学法所民得经十三之进着等部度家电力里如水化高自二理起小物现实加量都两体制机当使点从业本去把性好应开它合还因由其些然前外天政四日那社义事平形相全表间样与关各重新线内数正心反你明看原又么利比或但质气第向道命此变条只没结解问意建月公无系军很情者最立代想已通并提直题党程展五果料象员革位入常文总次品式活设及管特件长求老头基资边流路级少图山统接知较将组见计别她手角期根论运农指几九区强放决西被干做必战先回则任取据处队南给色光门即保治北造百规热领七海口东导器压志世金增争济阶油思术极交受联什认六共权收证改清己美再采转更单风切打白教速花带安场身车例真务具万每目至达走积示议声报斗完类八离华名确才科张信马节话米整空元况今集温传土许步群广石记需段研界拉林律叫且究观越织装影算低持音众书布复容儿须际商非验连断深难近矿千周委素技备半办青省列习响约支般史感劳便团往酸历市克何除消构府称太准精值号率族维划选标写存候毛亲快效斯院查江型眼王按格养易置派层片始却专状育厂京识适属圆包火住调满县局照参红细引听该铁价严龙城拿兵位乐万机字课斯院朝径杂灿伦票昨愿终纪汤春壤冬况环司令叔尺炎午控根整套企评职图片初层算据钟呢投宣云端版税庄鼓盖耕惊银森缺偏祝握苦疯猪智冷恋抱蟹牛磨擦娄绸粗兼痛眼砖窗绿陵杀妻厚亿茄渐赛婷旗瑞莲诸霍尔哭挑菜茂杨伐脸尖猫轰玛吸泪玉杰滑宿怕船虚恶寄塞恰拟酒毅丘兔寒慧醒砂聘祖哪伙腿蹲虫圣帽伴翻阳敬馅沸阔乌跟踪殊齐欲献撰砚辞铃钳畔旨亲睛莎舅朵兜狮廊驴豪帮辞典堤捧溶粟阔骆锌蔗迈椅灭腾夹纹碧洞袁颗豹盾曰扁吨琴喷慎虽栋罐瓦铸虾嚣杯陪伊憎颤铭萤斜扇沼垄亢俗稍遣俺烁蓝躲琅洁闽擅垂圆嵌脯仑姑侦蛇燃艰咨氢闺胡峡菊窟扩蹄媚耗淫秦牧绽顾绳尾坦肾逻厘逗猎渔崇缅睹枯墨雷潮胞撤瞪俊甘岛帝敞恃赏曰舆砌坯妖歇娜腰芽勘漠鹰唯蠢惩臭烽毕摧堪枯抵袍逐萄抑圈黄矛艳滩涧掌眯霞萝宽蛮隔宙篮炭疫阻栽峻奥烟弟渊滨孟岱茁傻顶犯闺屈蛮颇矣潭烫淌纠筹叮缩脱肪苹丧妹靴匀庆扑昙炯粒肃桃扼哑骑怨糠愈拾榔焦蜡辣狂矛硕楠墅毒坟寥闻绰琛捣炯壶喷圾拈囊巢袭宵虚虹歧畅扑俺朗昆萄燎婿侮祸隧疫拘炼嫂穆艘漫轨膊躺眺寅艺刑昭栋茵昌坡伏痕锈螺颈蹬幕谱赚揍咚韭腼伍羹郸懒虹偷汪茶窿琪虚瞧庞拒乏巧蜗穴瞄挡兮陶吵煤鞭寂燕滞涯卧虞讼蚪昧晋昧蜡烫弧饼栏榜梅涤崖滔褐薯剪菇跌匹糯豫愿瑚燃熄拗苑痴弘楷雹鬼秸驳翩侯瞻胳枢斥咬脊涂棺蒲踢箭锅聊渭耀糟鸭雀鲤蓟聪藕橱柏瞭碘醋胆荡秽厨泊翘韵禄掏玄倔嗽蛛禾滥哲绞蔑拐豁柑狭藏莫闷咽撒燥颂缔骚裹捻瞻伐镣殃撼劲霍羞咋腔盔酬闲纯堵豌肚曼娩匝晓磐阳睛揣禾蛋稼赊衍嚼弹凤崩卵蔚妓咒鄂纵苇憋眯饥窃圾拳挎巾泞陕靴赐兆踌惕舆猾嚎弥耳蓬靠泅垂泪';
        
        // 动态字符集（运行时添加的汉字）
        this.dynamicChars = new Set();
        this.dynamicCharMap = {};
        
        // 创建纹理画布
        this.fontAtlasCanvas = document.createElement('canvas');
        this.fontAtlasCtx = this.fontAtlasCanvas.getContext('2d');
        
        // 字符映射表
        this.charMap = {};
        // 字符实际宽度缓存表
        this.charWidthCache = {};
        
        // 计算字符尺寸（汉字需要更大空间）
        var fontSize = Math.floor(this.fontSize);
        var charWidth = Math.ceil(fontSize * 0.85);  // 图集格子宽度
        var charHeight = Math.ceil(fontSize * 1.3); // 汉字高度
        
        // 存储字符尺寸信息
        this.charWidth = charWidth;
        this.charHeight = charHeight;
        
        // 计算图集尺寸（网格排列）
        var charsPerRow = 128; // 每行128个字符（支持3500+汉字）
        var rows = Math.ceil(this.charset.length / charsPerRow);
        
        this.fontAtlasCanvas.width = charsPerRow * charWidth;
        this.fontAtlasCanvas.height = rows * charHeight;
        
        // 预留动态字符空间（可扩展几千个生僻字）
        this.fontAtlasCanvas.height += charHeight * 50; // 额外50行给动态字符
        
        // 设置等宽字体样式 - 性能优化
        this.fontAtlasCtx.font = fontSize + 'px "Consolas", "Menlo", "Monaco", "Courier New", monospace';
        this.fontAtlasCtx.fillStyle = this.textColor;
        this.fontAtlasCtx.textAlign = 'left';
        this.fontAtlasCtx.textBaseline = 'middle';
        
        // 等宽字体固定宽度计算
        this.FIXED_CHAR_WIDTH = Math.ceil(fontSize * 0.6); // 等宽字体的统一宽度
        
        // 字符间距设置 - 进一步调整间距
        this.ASCII_SPACING = Math.ceil(fontSize * -0.2);  // ASCII字符间距（更紧凑）
        this.CJK_SPACING = Math.ceil(fontSize * 0.1);     // 汉字字符间距（更紧凑）
        
        // 预渲染所有字符
        this.charsPerRow = charsPerRow;
        this.currentRow = 0;
        
        for (var i = 0; i < this.charset.length; i++) {
            var char = this.charset[i];
            var col = i % charsPerRow;
            var row = Math.floor(i / charsPerRow);
            
            var x = col * charWidth;  // 左对齐，不需要居中
            var y = row * charHeight + charHeight / 2;
            
            // 渲染字符到图集
            this.fontAtlasCtx.fillText(char, x, y);
            
            // 保存字符位置信息
            this.charMap[char] = {
                x: col * charWidth,
                y: row * charHeight,
                width: charWidth,
                height: charHeight
            };
        }
        
        // 记录动态字符起始行
        this.dynamicStartRow = Math.ceil(this.charset.length / charsPerRow);
        this.dynamicCurrentCol = 0;
        this.dynamicCurrentRow = this.dynamicStartRow;
        
        console.log('字符图集创建完成:', this.charset.length, '个字符已预加载，支持动态添加生僻字');
    }
    
    
    // 动态添加汉字到图集
    addCharToAtlas(char) {
        // 验证字符有效性
        if (!char || char.length !== 1) return;
        
        // 更宽松的字符过滤，只过滤真正有害的字符
        const charCode = char.charCodeAt(0);
        // 只过滤严重的控制字符，保留制表符、换行符等
        if (charCode < 32 && charCode !== 9 && charCode !== 10 && charCode !== 13) {
            return; // 跳过有害控制字符
        }
        
        // 过滤非字符区域（保留大部分正常Unicode字符）
        if (charCode >= 0xFFFE && charCode <= 0xFFFF) {
            return; // 只过滤非字符
        }
        
        if (this.charMap[char] || this.dynamicChars.has(char)) {
            return; // 字符已存在
        }
        
        // 检查是否有空间添加新字符
        if (this.dynamicCurrentRow >= Math.floor(this.fontAtlasCanvas.height / this.charHeight)) {
            console.warn('字符图集空间不足，无法添加字符:', char);
            return;
        }
        
        // 计算新字符位置
        var x = this.dynamicCurrentCol * this.charWidth;  // 左对齐
        var y = this.dynamicCurrentRow * this.charHeight + this.charHeight / 2;
        
        try {
            // 安全渲染新字符到图集
            this.fontAtlasCtx.fillText(char, x, y);
            
            // 保存字符位置信息
            this.charMap[char] = {
                x: this.dynamicCurrentCol * this.charWidth,
                y: this.dynamicCurrentRow * this.charHeight,
                width: this.charWidth,
                height: this.charHeight
            };
            
            // 标记为动态字符
            this.dynamicChars.add(char);
            
            // 更新位置计数器
            this.dynamicCurrentCol++;
            if (this.dynamicCurrentCol >= this.charsPerRow) {
                this.dynamicCurrentCol = 0;
                this.dynamicCurrentRow++;
            }
            
            console.log('动态添加字符:', char, '(Unicode:', char.charCodeAt(0).toString(16), ') 位置:(', this.dynamicCurrentCol-1, ',', this.dynamicCurrentRow, ') 总计:', this.dynamicChars.size, '个动态字符');
        } catch (e) {
            console.error('添加字符到图集失败:', char, e);
        }
    }
    
    // 使用字符图集绘制文字（支持多行自动换行）
    drawTextWithAtlas(ctx, text, centerX, centerY, color, maxWidth) {
        if (!text) return;
        
        var textStr = String(text);
        
        // 计算可用宽度（单元格内留边距）
        var availableWidth = maxWidth || (this.cellWidth - 10);
        
        // 检查是否需要换行
        var lines = this.wrapText(textStr, availableWidth);
        
        // 如果需要不同颜色，使用Canvas fillText
        if (color && color !== this.textColor) {
            ctx.save();
            ctx.font = Math.floor(this.fontSize) + 'px "Consolas", "Menlo", "Monaco", "Courier New", monospace';
            ctx.fillStyle = color;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            // 多行绘制
            var lineHeight = this.fontSize * 1.2;
            var totalHeight = lines.length * lineHeight;
            var startY = centerY - totalHeight / 2 + lineHeight / 2;
            
            for (var i = 0; i < lines.length; i++) {
                var y = startY + i * lineHeight;
                ctx.fillText(lines[i], centerX, y);
            }
            
            ctx.restore();
            return;
        }
        
        // 使用字符图集（默认颜色，多行）
        if (!this.fontAtlasCanvas) return;
        
        // 预处理：验证并添加缺失的字符（严格过滤）
        for (var i = 0; i < textStr.length; i++) {
            var char = textStr[i];
            
            // 验证字符有效性
            if (!char || char.length !== 1) continue;
            
            const charCode = char.charCodeAt(0);
            // 严格过滤不可见控制字符
            if (charCode < 32 && charCode !== 9 && charCode !== 10 && charCode !== 13) {
                continue;
            }
            
            // 过滤非字符区域（更宽松的过滤）
            if (charCode >= 0xFFFE && charCode <= 0xFFFF) {
                continue;
            }
            
            if (!this.charMap[char]) {
                this.addCharToAtlas(char);
            }
        }
        
        // 多行绘制（性能优化版）
        var lineHeight = this.charHeight * 1.1;
        var totalHeight = lines.length * lineHeight;
        var startY = centerY - totalHeight / 2;
        
        // 超级优化：使用对象池减少内存分配
        var lineInfos = [];
        var drawOperations = [];
        
        // 预计算所有行的位置信息（使用对象池）
        for (var lineIndex = 0; lineIndex < lines.length; lineIndex++) {
            var line = lines[lineIndex];
            if (!line) continue;
            
            var lineWidth = this.getTextWidth(line);
            
            var lineInfo = this.getPooledObject('lineInfos');
            lineInfo.text = line;
            lineInfo.width = lineWidth;
            lineInfo.startX = centerX - lineWidth / 2;
            lineInfo.y = startY + lineIndex * lineHeight + this.charHeight / 2;
            
            lineInfos.push(lineInfo);
        }
        
        // 批量收集所有drawImage操作（使用对象池）
        for (var i = 0; i < lineInfos.length; i++) {
            var lineInfo = lineInfos[i];
            var currentX = lineInfo.startX;
            var drawY = lineInfo.y - this.charHeight / 2;
            
            // 收集绘制操作而不是立即执行
            for (var charIndex = 0; charIndex < lineInfo.text.length; charIndex++) {
                var char = lineInfo.text[charIndex];
                var charInfo = this.charMap[char];
                
                if (charInfo) {
                    var code = char.charCodeAt(0);
                    var charDisplayWidth, charSpacing;
                    
                    // 分离字符显示宽度和间距
                    if (code < 128) {
                        charDisplayWidth = this.FIXED_CHAR_WIDTH;
                        charSpacing = this.ASCII_SPACING;
                    } else {
                        charDisplayWidth = this.FIXED_CHAR_WIDTH * 1.5;
                        charSpacing = this.CJK_SPACING;
                    }
                    
                    var op = this.getPooledObject('drawOperations');
                    op.sx = charInfo.x;
                    op.sy = charInfo.y;
                    op.sw = charInfo.width;
                    op.sh = charInfo.height;
                    op.dx = currentX;
                    op.dy = drawY;
                    op.dw = charDisplayWidth; // 字符本身宽度，不包含间距
                    op.dh = charInfo.height;
                    
                    drawOperations.push(op);
                    currentX += charDisplayWidth + charSpacing; // 字符宽度 + 间距
                }
            }
        }
        
        // 批量执行所有drawImage操作
        this.batchDrawImages(ctx, drawOperations);
        
        // 归还对象到池中
        for (var i = 0; i < lineInfos.length; i++) {
            this.returnPooledObject('lineInfos', lineInfos[i]);
        }
        for (var i = 0; i < drawOperations.length; i++) {
            this.returnPooledObject('drawOperations', drawOperations[i]);
        }
    }
    
    // 批量绘制优化：减少Canvas API调用开销
    batchDrawImages(ctx, operations) {
        if (operations.length === 0) return;
        
        // 按批次处理，避免一次性操作太多导致阻塞
        var batchSize = Math.min(this.renderBatchSize, operations.length);
        
        // GPU优化：使用transform矩阵减少坐标计算
        ctx.save();
        
        for (var i = 0; i < operations.length; i += batchSize) {
            var endIndex = Math.min(i + batchSize, operations.length);
            
            // 批量执行drawImage
            for (var j = i; j < endIndex; j++) {
                var op = operations[j];
                ctx.drawImage(
                    this.fontAtlasCanvas,
                    op.sx, op.sy, op.sw, op.sh,
                    op.dx, op.dy, op.dw, op.dh
                );
            }
            
            // 每批次后让出控制权，保持响应性
            if (endIndex < operations.length) {
                // 使用异步执行剩余批次
                setTimeout(() => {
                    this.batchDrawImages(ctx, operations.slice(endIndex));
                }, 0);
                break;
            }
        }
        
        ctx.restore();
    }
    
    // 绘制背景层（只绘制一次的静态元素）
    drawBackgroundLayer() {
        if (this.backgroundDrawn) return;
        
        // 确保背景层Canvas尺寸正确
        this.backgroundCanvas.width = this.canvas.width;
        this.backgroundCanvas.height = this.canvas.height;
        
        var ctx = this.backgroundCtx;
        
        // 清空背景层
        ctx.clearRect(0, 0, this.backgroundCanvas.width, this.backgroundCanvas.height);
        
        // 绘制表头背景
        ctx.fillStyle = this.headerBgColor;
        ctx.fillRect(this.offsetX, this.offsetY, this.cols * this.cellWidth, this.headerHeight);
        
        // 绘制表头文字（使用字符图集）
        for (var col = 0; col < this.cols; col++) {
            var x = this.offsetX + col * this.cellWidth + this.cellWidth / 2;
            var y = this.offsetY + this.headerHeight / 2;
            this.drawTextWithAtlas(ctx, this.headers[col], x, y, this.headerTextColor);
        }
        
        // 绘制数据行背景（交替色）
        for (var row = 0; row < this.rows; row++) {
            var y = this.offsetY + this.headerHeight + row * this.cellHeight;
            
            // 交替行背景色
            ctx.fillStyle = row % 2 === 0 ? this.cellBgColor : this.altRowBgColor;
            ctx.fillRect(this.offsetX, y, this.cols * this.cellWidth, this.cellHeight);
        }
        
        // 绘制网格线
        this.drawBackgroundBorders(ctx);
        
        this.backgroundDrawn = true;
    }
    
    // 绘制数据层（只绘制数据文字）
    drawDataLayer() {
        // 确保数据层Canvas尺寸正确
        this.dataCanvas.width = this.canvas.width;
        this.dataCanvas.height = this.canvas.height;
        
        var ctx = this.dataCtx;
        
        // 清空数据层
        ctx.clearRect(0, 0, this.dataCanvas.width, this.dataCanvas.height);
        
        // 绘制所有单元格数据
        for (var row = 0; row < this.rows; row++) {
            for (var col = 0; col < this.cols; col++) {
                if (this.data[row] && this.data[row][col]) {
                    var cellX = this.offsetX + col * this.cellWidth + this.cellWidth / 2;
                    var cellY = this.offsetY + this.headerHeight + row * this.cellHeight + this.cellHeight / 2;
                    this.drawTextWithAtlas(ctx, this.data[row][col], cellX, cellY, this.textColor);
                }
            }
        }
        
        this.dataDrawn = true;
    }
    
    // 绘制编辑层（正在编辑的单元格内容和光标）
    drawEditLayer() {
        // 清空编辑层
        this.editCtx.clearRect(0, 0, this.editCanvas.width, this.editCanvas.height);
        
        if (!this.editingCell) {
            // 如果没有编辑状态，直接绘制空的编辑层
            this.ctx.drawImage(this.editCanvas, 0, 0);
            return;
        }
        
        var cell = this.editingCell;
        var cellX = this.offsetX + cell.col * this.cellWidth;
        var cellY = this.offsetY + this.headerHeight + cell.row * this.cellHeight;
        
        // 绘制编辑单元格高亮背景
        this.editCtx.fillStyle = 'rgba(0, 123, 255, 0.1)';
        this.editCtx.fillRect(cellX, cellY, this.cellWidth, this.cellHeight);
        
        // 绘制编辑中的文字（支持多行）
        var textX = cellX + this.cellWidth / 2;
        var textY = cellY + this.cellHeight / 2;
        var maxWidth = this.cellWidth - 10; // 留边距
        
        if (this.editingText) {
            this.drawTextWithAtlas(this.editCtx, this.editingText, textX, textY, this.textColor, maxWidth);
        }
        
        // 绘制光标（支持多行）
        if (this.cursorVisible) {
            this.drawMultiLineCursor(cell, this.editingText, this.cursorPosition);
        }
        
        // 绘制编辑层到主画布
        this.ctx.drawImage(this.editCanvas, 0, 0);
    }
    
    // 计算文字的真实宽度 - 包含字符间距
    getTextWidth(text) {
        var width = 0;
        for (var i = 0; i < text.length; i++) {
            var char = text[i];
            var code = char.charCodeAt(0);
            
            // 字符宽度 + 间距
            if (code < 128) {
                width += this.FIXED_CHAR_WIDTH + this.ASCII_SPACING;        // ASCII字符 + 间距
            } else {
                width += this.FIXED_CHAR_WIDTH * 1.5 + this.CJK_SPACING;    // 中文字符 + 间距
            }
        }
        return width;
    }
    
    // 文字自动换行处理 - 中英文混合优化版
    wrapText(text, maxWidth) {
        if (!text) return [];
        
        var lines = [];
        var currentLine = '';
        var currentWidth = 0;
        
        // 先按手动换行符分割
        var paragraphs = text.split('\n');
        
        for (var p = 0; p < paragraphs.length; p++) {
            var paragraph = paragraphs[p];
            currentLine = '';
            currentWidth = 0;
            
            for (var i = 0; i < paragraph.length; i++) {
                var char = paragraph[i];
                var code = char.charCodeAt(0);
                
                // 字符宽度 + 间距
                var charWidth = (code < 128) ? 
                    this.FIXED_CHAR_WIDTH + this.ASCII_SPACING : 
                    this.FIXED_CHAR_WIDTH * 1.5 + this.CJK_SPACING;
                
                var testWidth = currentWidth + charWidth;
                
                if (testWidth > maxWidth && currentLine.length > 0) {
                    // 当前行已满，开始新行
                    lines.push(currentLine);
                    currentLine = char;
                    currentWidth = charWidth;
                } else {
                    currentLine += char;
                    currentWidth = testWidth;
                }
            }
            
            // 添加段落的最后一行
            if (currentLine.length > 0) {
                lines.push(currentLine);
            } else if (paragraph.length === 0) {
                lines.push('');
            }
        }
        
        return lines;
    }
    
    // 绘制多行光标
    drawMultiLineCursor(cell, text, cursorPos) {
        var cellX = this.offsetX + cell.col * this.cellWidth;
        var cellY = this.offsetY + this.headerHeight + cell.row * this.cellHeight;
        var maxWidth = this.cellWidth - 10;
        
        // 获取换行后的文本行
        var lines = this.wrapText(text, maxWidth);
        
        // 如果只有一行文本，光标始终在单元格垂直中心
        if (lines.length <= 1) {
            var textBeforeCursor = text.substring(0, cursorPos);
            var textWidthBeforeCursor = this.getTextWidth(textBeforeCursor);
            var totalTextWidth = this.getTextWidth(text);
            
            // 光标X位置：单元格中心 - 总文本宽度一半 + 光标前文字宽度
            var cursorX = cellX + this.cellWidth / 2 - totalTextWidth / 2 + textWidthBeforeCursor;
            
            // 光标Y位置：单元格垂直中心
            var cursorY = cellY + this.cellHeight / 2;
            
            // 光标的上下端点
            var cursorHeight = this.charHeight * 0.8;
            var cursorY1 = cursorY - cursorHeight / 2;
            var cursorY2 = cursorY + cursorHeight / 2;
            
            // 绘制光标线
            this.editCtx.strokeStyle = '#000';
            this.editCtx.lineWidth = 2;
            this.editCtx.beginPath();
            this.editCtx.moveTo(cursorX, cursorY1);
            this.editCtx.lineTo(cursorX, cursorY2);
            this.editCtx.stroke();
            return;
        }
        
        // 多行文本的光标处理（原有逻辑）
        var currentPos = 0;
        var cursorLine = 0;
        var cursorInLine = 0;
        
        // 重新计算光标在哪一行
        for (var i = 0; i < lines.length; i++) {
            var lineLength = lines[i].length;
            
            // 检查光标是否在当前行
            if (cursorPos <= currentPos + lineLength) {
                cursorLine = i;
                cursorInLine = cursorPos - currentPos;
                break;
            }
            
            currentPos += lineLength;
            
            // 如果不是最后一行，检查是否有换行符
            if (i < lines.length - 1) {
                // 检查原文本在此位置是否有换行符
                if (currentPos < text.length && text[currentPos] === '\n') {
                    currentPos++; // 跳过换行符
                }
            }
        }
        
        // 确保光标行不超出范围
        if (cursorLine >= lines.length) {
            cursorLine = lines.length - 1;
            cursorInLine = lines[cursorLine] ? lines[cursorLine].length : 0;
        }
        
        // 计算光标前的文字宽度
        var textBeforeCursor = lines[cursorLine] ? lines[cursorLine].substring(0, cursorInLine) : '';
        var textWidthBeforeCursor = this.getTextWidth(textBeforeCursor);
        var lineWidth = lines[cursorLine] ? this.getTextWidth(lines[cursorLine]) : 0;
        
        // 使用与文本绘制完全相同的行高和起始位置
        var lineHeight = this.charHeight * 1.1; // 与drawTextWithAtlas保持一致
        var totalHeight = lines.length * lineHeight;
        var startY = cellY + this.cellHeight / 2 - totalHeight / 2;
        
        // 光标X位置：当前行的起始X + 光标前文字宽度
        var lineStartX = cellX + this.cellWidth / 2 - lineWidth / 2;
        var cursorX = lineStartX + textWidthBeforeCursor;
        
        // 光标Y位置：与文本绘制位置完全对齐
        var textY = startY + cursorLine * lineHeight + this.charHeight / 2;
        var cursorY = textY;
        
        // 光标的上下端点，让光标高度约为字符高度的80%
        var cursorHeight = this.charHeight * 0.8;
        var cursorY1 = cursorY - cursorHeight / 2;
        var cursorY2 = cursorY + cursorHeight / 2;
        
        // 绘制光标线
        this.editCtx.strokeStyle = '#000';
        this.editCtx.lineWidth = 2;
        this.editCtx.beginPath();
        this.editCtx.moveTo(cursorX, cursorY1);
        this.editCtx.lineTo(cursorX, cursorY2);
        this.editCtx.stroke();
    }
    
    
    // 开始光标闪烁
    startCursorBlink() {
        this.stopCursorBlink();
        var self = this;
        this.cursorBlinkTimer = setInterval(function() {
            // 只有在编辑状态下才闪烁光标
            if (self.editingCell) {
                self.cursorVisible = !self.cursorVisible;
                self.needsRedraw = true;
                self.debouncedDraw(); // 使用防抖绘制
            }
        }, 500); // 每500ms闪烁一次
    }
    
    // 停止光标闪烁
    stopCursorBlink() {
        if (this.cursorBlinkTimer) {
            clearInterval(this.cursorBlinkTimer);
            this.cursorBlinkTimer = null;
        }
        this.cursorVisible = true;
    }
    
    // 绘制背景层的网格线
    drawBackgroundBorders(ctx) {
        ctx.strokeStyle = this.borderColor;
        ctx.lineWidth = 1;
        
        // 批量绘制所有线条以提高性能
        ctx.beginPath();
        
        // 绘制垂直线
        for (var col = 0; col <= this.cols; col++) {
            var x = this.offsetX + col * this.cellWidth;
            ctx.moveTo(x, this.offsetY);
            ctx.lineTo(x, this.offsetY + this.headerHeight + this.rows * this.cellHeight);
        }
        
        // 绘制水平线 - 表头底部
        ctx.moveTo(this.offsetX, this.offsetY + this.headerHeight);
        ctx.lineTo(this.offsetX + this.cols * this.cellWidth, this.offsetY + this.headerHeight);
        
        // 绘制水平线 - 数据行
        for (var row = 0; row <= this.rows; row++) {
            var y = this.offsetY + this.headerHeight + row * this.cellHeight;
            ctx.moveTo(this.offsetX, y);
            ctx.lineTo(this.offsetX + this.cols * this.cellWidth, y);
        }
        
        // 一次性执行所有stroke操作
        ctx.stroke();
    }
    
    draw() {
        // 性能优化：帧率限制
        const now = performance.now();
        if (now - this.lastDrawTime < this.frameThrottle) {
            requestAnimationFrame(() => this.draw());
            return;
        }
        this.lastDrawTime = now;
        
        // 只在需要时重绘
        if (!this.needsRedraw) return;
        
        // 清空主画布
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // 分层绘制：
        // 1. 背景层（表格框架、网格线）
        this.ctx.drawImage(this.backgroundCanvas, 0, 0);
        
        // 2. 数据层（数据文字）
        if (!this.dataDrawn) {
            this.drawDataLayer();
        }
        this.ctx.drawImage(this.dataCanvas, 0, 0);
        
        // 3. 编辑层（正在编辑的单元格和光标）
        this.drawEditLayer();
        this.needsRedraw = false;
    }
    
    // 防抖绘制方法，避免频繁重绘
    debouncedDraw() {
        // 清除之前的定时器
        if (this.drawDebounceTimer) {
            clearTimeout(this.drawDebounceTimer);
        }
        
        // 设置新的防抖定时器
        const self = this;
        this.drawDebounceTimer = setTimeout(function() {
            self.draw();
            self.drawDebounceTimer = null;
        }, this.drawDebounceDelay);
    }
    
    getCellFromCoords(x, y) {
        // 优化：使用缓存的坐标计算
        const cacheKey = `${Math.floor(x/10)}_${Math.floor(y/10)}`;
        if (this.cellCache.has(cacheKey)) {
            return this.cellCache.get(cacheKey);
        }
        
        // 调整坐标以考虑偏移
        const adjustedX = x - this.offsetX;
        const adjustedY = y - this.offsetY;
        
        if (adjustedY < this.headerHeight || adjustedX < 0) {
            this.cellCache.set(cacheKey, null);
            return null;
        }
        
        const col = Math.floor(adjustedX / this.cellWidth);
        const row = Math.floor((adjustedY - this.headerHeight) / this.cellHeight);
        
        const result = (col >= 0 && col < this.cols && row >= 0 && row < this.rows) 
            ? { row, col } : null;
            
        // 缓存结果
        this.cellCache.set(cacheKey, result);
        
        // 定期清理缓存
        if (this.cellCache.size > 1000) {
            this.cellCache.clear();
        }
        
        return result;
    }
    
    
    addEventListeners() {
        var self = this;
        
        // 优化：缓存边界矩形，减少重复计算
        const updateBoundingRect = () => {
            self.boundingRect = self.canvas.getBoundingClientRect();
            self.lastCacheUpdate = performance.now();
        };
        
        // 初始化边界矩形
        updateBoundingRect();
        
        // 监听窗口大小变化，更新缓存
        window.addEventListener('resize', updateBoundingRect);
        
        this.canvas.addEventListener('click', function(e) {
            // 阻止事件冒泡到document级别，避免立即触发finishEdit
            e.stopPropagation();
            
            // 使用缓存的边界矩形
            if (performance.now() - self.lastCacheUpdate > 1000) {
                updateBoundingRect(); // 每秒最多更新一次
            }
            
            var x = e.clientX - self.boundingRect.left;
            var y = e.clientY - self.boundingRect.top;
            
            var cell = self.getCellFromCoords(x, y);
            
            // 处理所有有效单元格的点击
            if (cell) {
                // 检查是否点击了同一个单元格
                const isSameCell = self.editingCell && 
                                  self.editingCell.row === cell.row && 
                                  self.editingCell.col === cell.col;
                
                if (!isSameCell) {
                    // 立即开始编辑（最重要的操作）
                    if (cell.col === 6) { // 第7列使用自定义日期控件
                        self.finishEdit(); // 完成之前的编辑
                        self.showCustomDatePicker(cell);
                        self.setupDateCellKeyListener(cell);
                    } else if (cell.col === 2) { // 第3列（年龄）使用数字键盘
                        self.finishEdit(); // 完成之前的编辑
                        self.showNumberPad(cell);
                    } else {
                        self.startCellEdit(cell);
                    }
                }
            }
        });
        
        // 创建隐藏的输入框用于中文输入（防重复创建）
        if (!this.hiddenInput) {
            this.hiddenInput = document.createElement('input');
            this.hiddenInput.style.cssText = `
                position: absolute;
                left: 0px;
                top: 0px;
                width: 1px;
                height: 1px;
                opacity: 0;
                background: transparent;
                border: none;
                outline: none;
                pointer-events: none;
                z-index: -1;
            `;
            this.hiddenInput.setAttribute('autocomplete', 'off');
            this.hiddenInput.setAttribute('autocorrect', 'off');
            this.hiddenInput.setAttribute('autocapitalize', 'off');
            this.hiddenInput.setAttribute('spellcheck', 'false');
            document.body.appendChild(this.hiddenInput);
        }
        
        // 添加键盘事件监听
        this.canvas.tabIndex = 1000; // 让Canvas可以获得焦点
        
        // 清除之前的事件监听器，防止重复绑定
        this.removeInputEventListeners();
        
        // 绑定新的事件监听器
        this.inputHandler = function(e) {
            self.handleInput(e);
        };
        
        this.keydownHandler = function(e) {
            self.handleKeyDown(e);
        };
        
        // 输入法组合事件处理
        this.compositionHandler = function(e) {
            self.handleComposition(e);
        };
        
        this.hiddenInput.addEventListener('input', this.inputHandler);
        this.hiddenInput.addEventListener('keydown', this.keydownHandler);
        this.hiddenInput.addEventListener('compositionstart', this.compositionHandler);
        this.hiddenInput.addEventListener('compositionend', this.compositionHandler);
        
        // 点击其他地方取消编辑（改进版：避免干扰数字键盘）
        document.addEventListener('click', function(e) {
            // 检查是否点击在各种控件内部
            const isDatePickerClick = self.customDatePicker && self.customDatePicker.contains(e.target);
            const isNumberPadClick = self.numberPad && self.numberPad.contains(e.target);
            const isCanvasClick = e.target === self.canvas;
            
            // 如果点击了控件内部，不做任何处理
            if (isDatePickerClick || isNumberPadClick) {
                return;
            }
            
            // 如果有编辑状态且点击了控件外部（包括画布的其他位置），结束编辑
            if (self.editingCell || 
                (self.numberPad && self.numberPad.style.display !== 'none') ||
                (self.customDatePicker && self.customDatePicker.style.display !== 'none')) {
                
                self.finishEdit();
            }
        });
    }
    
    // 清除输入事件监听器，防止重复绑定
    removeInputEventListeners() {
        if (this.hiddenInput && this.inputHandler) {
            this.hiddenInput.removeEventListener('input', this.inputHandler);
        }
        if (this.hiddenInput && this.keydownHandler) {
            this.hiddenInput.removeEventListener('keydown', this.keydownHandler);
        }
        if (this.hiddenInput && this.compositionHandler) {
            this.hiddenInput.removeEventListener('compositionstart', this.compositionHandler);
            this.hiddenInput.removeEventListener('compositionend', this.compositionHandler);
        }
    }
    
    // 初始化输入控件（只保留日期选择器）
    initInputControls() {
        var self = this;
        
        // 日期选择器事件
        this.datePicker.addEventListener('change', function() {
            if (self.editingCell) {
                self.updateCellData(self.editingCell.row, self.editingCell.col, this.value);
                self.hideDatePicker();
            }
        });
        
        this.datePicker.addEventListener('blur', function() {
            self.hideDatePicker();
        });
    }
    
    // 开始单元格编辑
    startCellEdit(cell) {
        // 结束之前的编辑
        this.finishEdit();
        
        // 隐藏日期控件
        this.hideCustomDatePicker();
        
        this.editingCell = cell;
        this.editingText = this.data[cell.row] ? this.data[cell.row][cell.col] || '' : '';
        this.cursorPosition = this.editingText.length; // 光标置于末尾
        this.cursorVisible = true;
        
        // 计算单元格在页面中的位置，定位隐藏输入框
        var cellX = this.offsetX + cell.col * this.cellWidth;
        var cellY = this.offsetY + this.headerHeight + cell.row * this.cellHeight;
        
        // 获取Canvas相对于页面的位置
        var rect = this.canvas.getBoundingClientRect();
        var pageX = rect.left + cellX;
        var pageY = rect.top + cellY;
        
        // 设置隐藏输入框位置到单元格位置（确保输入法候选框在正确位置）
        this.hiddenInput.style.left = pageX + 'px';
        this.hiddenInput.style.top = pageY + 'px';
        this.hiddenInput.style.width = this.cellWidth + 'px';
        this.hiddenInput.style.height = this.cellHeight + 'px';
        
        // 设置隐藏输入框的值并给它焦点（支持中文输入）
        this.hiddenInput.value = this.editingText;
        this.hiddenInput.focus();
        // 同步光标位置到隐藏输入框
        this.hiddenInput.setSelectionRange(this.cursorPosition, this.cursorPosition);
        
        // 同步启动光标和绘制，避免时序竞争（关键修复）
        var self = this;
        setTimeout(function() {
            // 确保编辑状态仍然有效
            if (self.editingCell) {
                self.startCursorBlink();
                self.needsRedraw = true;
                self.debouncedDraw(); // 使用防抖绘制
            }
        }, 0);
    }
    
    // 结束编辑
    finishEdit() {
        if (!this.editingCell) return;
        
        // 保存数据
        this.updateCellData(this.editingCell.row, this.editingCell.col, this.editingText);
        
        // 隐藏所有控件（统一状态管理）
        this.hideCustomDatePicker();
        
        // 统一使用hideNumberPad处理数字键盘状态（不保存数据，因为上面已经保存过了）
        if (this.numberPad && this.numberPad.style.display !== 'none') {
            // 直接隐藏数字键盘，不重复保存数据和清理状态
            this.numberPad.style.display = 'none';
        }
        
        // 清理所有编辑状态
        this.editingCell = null;
        this.editingText = '';
        this.numberInputText = '';
        this.cursorPosition = 0;
        this.stopCursorBlink();
        
        // 清理隐藏输入框并重新隐藏
        this.hiddenInput.value = '';
        this.hiddenInput.blur();
        // 将隐藏输入框移回不可见位置
        this.hiddenInput.style.left = '0px';
        this.hiddenInput.style.top = '0px';
        this.hiddenInput.style.width = '1px';
        this.hiddenInput.style.height = '1px';
        
        this.needsRedraw = true;
        this.debouncedDraw(); // 使用防抖绘制
    }
    
    
    // 处理键盘按下事件
    handleKeyDown(e) {
        if (!this.editingCell) return;
        
        // 只处理特殊按键，普通字符输入由input事件处理
        switch(e.key) {
            case 'Enter':
                if (e.shiftKey) {
                    // Shift+Enter换行 - 让input事件处理
                    return;
                } else {
                    // Enter完成编辑
                    this.finishEdit();
                    e.preventDefault();
                }
                break;
            case 'Escape':
                this.cancelEdit();
                e.preventDefault();
                break;
            case 'ArrowLeft':
                // 让隐藏输入框处理方向键，然后通过selectionchange或直接更新
                setTimeout(() => {
                    this.cursorPosition = this.hiddenInput.selectionStart;
                    this.needsRedraw = true;
                    this.draw();
                }, 0);
                break;
            case 'ArrowRight':
                // 让隐藏输入框处理方向键，然后通过selectionchange或直接更新
                setTimeout(() => {
                    this.cursorPosition = this.hiddenInput.selectionStart;
                    this.needsRedraw = true;
                    this.draw();
                }, 0);
                break;
            case 'ArrowUp':
            case 'ArrowDown':
                // 防止方向键滚动页面
                e.preventDefault();
                break;
            case 'Tab':
                // 防止Tab键切换焦点
                e.preventDefault();
                break;
            // 对于Backspace和Delete，让浏览器默认处理，然后input事件会触发
            case 'Backspace':
            case 'Delete':
                // 不阻止默认行为，让隐藏输入框处理
                break;
            default:
                // 对于其他按键（包括普通字符），不做处理，让input事件处理
                break;
        }
    }
    
    // 处理输入事件（支持中文，严格过滤）
    handleInput(e) {
        if (!this.editingCell) return;
        
        // 验证和清理输入内容
        let inputValue = this.hiddenInput.value || '';
        
        // 防重复处理：如果输入内容没有变化，跳过处理
        if (inputValue === this.editingText) {
            return;
        }
        
        // 更宽松的过滤：只移除真正有害的字符，保留大部分正常字符
        inputValue = inputValue.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // 严重控制字符，保留\t\n\r
                              .replace(/[\uFEFF]/g, ''); // BOM字符
        
        // 如果内容被清理过，更新隐藏输入框
        if (inputValue !== this.hiddenInput.value) {
            this.hiddenInput.value = inputValue;
        }
        
        // 安全地获取光标位置
        let cursorPos = 0;
        try {
            cursorPos = this.hiddenInput.selectionStart;
            if (cursorPos === null || cursorPos === undefined) {
                cursorPos = inputValue.length;
            }
        } catch (e) {
            cursorPos = inputValue.length;
        }
        
        // 确保光标位置在有效范围内
        cursorPos = Math.max(0, Math.min(cursorPos, inputValue.length));
        
        this.editingText = inputValue;
        this.cursorPosition = cursorPos;
        
        this.needsRedraw = true;
        this.draw();
    }
    
    // 处理输入法组合事件（中文输入法支持）
    handleComposition(e) {
        if (!this.editingCell) return;
        
        if (e.type === 'compositionstart') {
            // 输入法开始组合，设置标志
            this.isComposing = true;
        } else if (e.type === 'compositionend') {
            // 输入法组合结束，清除标志
            this.isComposing = false;
            // 确保最终结果被处理（延迟一点以避免重复）
            setTimeout(() => {
                if (!this.isComposing) { // 再次检查，确保不是新的组合开始
                    this.handleInput({ target: this.hiddenInput });
                }
            }, 10);
        }
    }
    
    // 在光标位置插入文字（现在主要由input事件处理，这个函数保留作为备用）
    insertTextAtCursor(text) {
        if (!this.editingCell || !text) return;
        
        // 更宽松的验证和清理要插入的文字
        const cleanText = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // 严重控制字符，保留\t\n\r
                             .replace(/[\uFEFF]/g, ''); // BOM字符
        if (!cleanText) return;
        
        // 安全地获取当前位置
        let currentPos = 0;
        try {
            currentPos = this.hiddenInput.selectionStart || 0;
        } catch (e) {
            currentPos = this.hiddenInput.value.length;
        }
        
        const currentValue = this.hiddenInput.value || '';
        const newValue = currentValue.substring(0, currentPos) + cleanText + currentValue.substring(currentPos);
        
        // 直接更新，不触发额外事件（避免重复处理）
        this.hiddenInput.value = newValue;
        const newPos = currentPos + cleanText.length;
        this.hiddenInput.setSelectionRange(newPos, newPos);
        
        // 直接调用handleInput，避免事件重复
        this.handleInput({ target: this.hiddenInput });
    }
    
    // 取消编辑
    cancelEdit() {
        if (!this.editingCell) return;
        
        // 隐藏日期控件
        this.hideCustomDatePicker();
        
        // 清理编辑状态，不保存数据
        this.editingCell = null;
        this.editingText = '';
        this.cursorPosition = 0;
        this.stopCursorBlink();
        
        // 清理隐藏输入框并重新隐藏
        this.hiddenInput.value = '';
        this.hiddenInput.blur();
        // 将隐藏输入框移回不可见位置
        this.hiddenInput.style.left = '0px';
        this.hiddenInput.style.top = '0px';
        this.hiddenInput.style.width = '1px';
        this.hiddenInput.style.height = '1px';
        
        this.needsRedraw = true;
        this.draw();
    }
    
    addRow() {
        this.rows++;
        this.data.push(new Array(this.cols).fill(''));
        this.backgroundDrawn = false; // 重新绘制背景层（行数改变）
        this.dataDrawn = false; // 重新绘制数据层
        this.drawBackgroundLayer();
        this.needsRedraw = true;
        this.draw();
    }
    
    addColumn() {
        this.cols++;
        this.headers.push('Column ' + this.cols);
        this.data.forEach(row => row.push(''));
        this.backgroundDrawn = false; // 重新绘制背景层（列数改变）
        this.dataDrawn = false; // 重新绘制数据层
        this.drawBackgroundLayer();
        this.needsRedraw = true;
        this.draw();
    }
    
    removeRow() {
        if (this.rows > 1) {
            this.rows--;
            this.data.pop();
            if (this.selectedCell && this.selectedCell.row >= this.rows) {
                this.selectedCell = null;
            }
            this.backgroundDrawn = false; // 重新绘制背景层（行数改变）
            this.dataDrawn = false; // 重新绘制数据层
            this.drawBackgroundLayer();
            this.needsRedraw = true;
            this.draw();
        }
    }
    
    removeColumn() {
        if (this.cols > 1) {
            this.cols--;
            this.headers.pop();
            this.data.forEach(row => row.pop());
            if (this.selectedCell && this.selectedCell.col >= this.cols) {
                this.selectedCell = null;
            }
            this.backgroundDrawn = false; // 重新绘制背景层（列数改变）
            this.dataDrawn = false; // 重新绘制数据层
            this.drawBackgroundLayer();
            this.needsRedraw = true;
            this.draw();
        }
    }
    
    refresh() {
        this.needsRedraw = true;
        this.draw();
    }
    
    updateCellData(row, col, value) {
        if (row >= 0 && row < this.rows && col >= 0 && col < this.cols) {
            if (!this.data[row]) {
                this.data[row] = new Array(this.cols).fill('');
            }
            this.data[row][col] = value;
            
            // 优化：只重绘指定单元格，不重绘整个数据层
            this.redrawCell(row, col);
            this.needsRedraw = true;
            this.draw();
        }
    }
    
    // 新增：单元格级别重绘（支持多行）
    redrawCell(row, col) {
        const cellX = this.offsetX + col * this.cellWidth;
        const cellY = this.offsetY + this.headerHeight + row * this.cellHeight;
        
        // 清除单元格区域
        this.dataCtx.clearRect(cellX, cellY, this.cellWidth, this.cellHeight);
        
        // 重绘单元格内容（支持多行）
        if (this.data[row] && this.data[row][col]) {
            const textX = cellX + this.cellWidth / 2;
            const textY = cellY + this.cellHeight / 2;
            const maxWidth = this.cellWidth - 10; // 留边距
            this.drawTextWithAtlas(this.dataCtx, this.data[row][col], textX, textY, this.textColor, maxWidth);
        }
    }
    
    
    // 清理函数，防止内存泄漏
    destroy() {
        // 清理事件监听器
        this.removeInputEventListeners();
        this.removeDateCellKeyListener();
        
        // 停止光标闪烁
        this.stopCursorBlink();
        
        // 清理隐藏输入框
        if (this.hiddenInput && this.hiddenInput.parentNode) {
            this.hiddenInput.parentNode.removeChild(this.hiddenInput);
        }
        
        // 清理自定义日期控件
        if (this.customDatePicker && this.customDatePicker.parentNode) {
            this.customDatePicker.parentNode.removeChild(this.customDatePicker);
        }
        
        // 清理数字键盘控件
        if (this.numberPad && this.numberPad.parentNode) {
            this.numberPad.parentNode.removeChild(this.numberPad);
        }
        
        // 清理缓存
        this.cellCache.clear();
        this.charWidthCache = {};
        this.charMap = {};
        this.dynamicChars.clear();
        
        console.log('Canvas表格已清理完成');
    }
}

// 初始化表格
const table = new CanvasTable('tableCanvas');