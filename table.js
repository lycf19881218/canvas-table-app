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
        this.fontSize = Math.max(12, Math.floor(this.cellHeight * 0.4)); // 根据行高自适应字体大小
        
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
        
        // 特效配置 - 所有列都可点击
        this.clickableColumns = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]; // 所有10列都可点击
        
        // 预渲染特效数据
        this.effect = {
            x: 0,                    // 特效中心X位置
            y: 0,                    // 特效中心Y位置
            active: false,           // 是否激活
            currentFrame: 0,         // 当前帧索引
            totalFrames: 36          // 总帧数 (600ms ÷ 16.67ms)
        };
        
        // 预计算动画帧数据
        this.precomputeAnimationFrames();
        
        // 创建字符纹理图集
        this.createFontAtlas();
        
        // 性能优化
        this.needsRedraw = true;
        
        // 输入控件引用（只保留日期选择器）
        this.datePicker = document.getElementById('datePicker');
        
        // 创建自定义日期控件
        this.createCustomDatePicker();
        
        // 内联编辑状态
        this.editingCell = null;
        this.editingText = '';
        this.cursorPosition = 0;
        this.cursorVisible = true;
        this.cursorBlinkTimer = null;
        
        this.init();
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
            padding: 4px 8px;
            background: transparent;
            border: none;
            cursor: pointer;
            font-size: 12px;
            color: #666;
            border-radius: 3px;
            transition: background-color 0.2s;
        `;
        
        // 向前按钮 (<)
        this.prevMonthBtn = document.createElement('button');
        this.prevMonthBtn.textContent = '<';
        this.prevMonthBtn.style.cssText = `
            padding: 4px 8px;
            background: transparent;
            border: none;
            cursor: pointer;
            font-size: 12px;
            color: #666;
            border-radius: 3px;
            transition: background-color 0.2s;
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
            padding: 4px 8px;
            background: transparent;
            border: none;
            cursor: pointer;
            font-size: 12px;
            color: #666;
            border-radius: 3px;
            transition: background-color 0.2s;
        `;
        
        // 快速向后按钮 (>>)
        this.nextYearBtn = document.createElement('button');
        this.nextYearBtn.textContent = '>>';
        this.nextYearBtn.style.cssText = `
            padding: 4px 8px;
            background: transparent;
            border: none;
            cursor: pointer;
            font-size: 12px;
            color: #666;
            border-radius: 3px;
            transition: background-color 0.2s;
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
    
    // 绑定日期控件事件
    bindDatePickerEvents() {
        const self = this;
        
        // 上一年按钮
        this.prevYearBtn.addEventListener('click', function() {
            self.currentYear--;
            self.updateDateGrid();
        });
        this.prevYearBtn.addEventListener('mouseenter', function() {
            this.style.background = '#f0f0f0';
        });
        this.prevYearBtn.addEventListener('mouseleave', function() {
            this.style.background = 'transparent';
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
            this.style.background = '#f0f0f0';
        });
        this.prevMonthBtn.addEventListener('mouseleave', function() {
            this.style.background = 'transparent';
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
            this.style.background = '#f0f0f0';
        });
        this.nextMonthBtn.addEventListener('mouseleave', function() {
            this.style.background = 'transparent';
        });
        
        // 下一年按钮
        this.nextYearBtn.addEventListener('click', function() {
            self.currentYear++;
            self.updateDateGrid();
        });
        this.nextYearBtn.addEventListener('mouseenter', function() {
            this.style.background = '#f0f0f0';
        });
        this.nextYearBtn.addEventListener('mouseleave', function() {
            this.style.background = 'transparent';
        });
        
        // 点击控件外部关闭
        document.addEventListener('click', function(e) {
            if (!self.customDatePicker.contains(e.target) && 
                !self.canvas.contains(e.target)) {
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
        this.finishEdit(); // 结束其他编辑
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
        let finalY = rect.top + cellY + 10; // 在单元格下方10px
        
        // 防止超出屏幕右侧
        if (finalX + 240 > window.innerWidth) {
            finalX = window.innerWidth - 250;
        }
        
        // 防止超出屏幕底部
        if (finalY + 200 > window.innerHeight) {
            finalY = rect.top + this.offsetY + this.headerHeight + cell.row * this.cellHeight - 210; // 显示在上方
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
        this.drawBackgroundLayer();
        this.drawDataLayer();
        this.draw();
        this.addEventListeners();
        this.initInputControls();
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
    
    // 预计算所有动画帧数据
    precomputeAnimationFrames() {
        this.animationFrames = [];
        var maxRadius = 40;
        
        for (var i = 0; i < this.effect.totalFrames; i++) {
            var progress = i / (this.effect.totalFrames - 1); // 0到1的进度
            
            var frame = {
                radius: maxRadius * progress,           // 半径线性增长
                alpha: 1.0 - progress,                 // 透明度线性减少
                innerRadius: Math.max(0, maxRadius * progress - 10) // 内圈半径
            };
            
            this.animationFrames.push(frame);
        }
    }
    
    // 创建字符纹理图集
    createFontAtlas() {
        // 定义字符集（包含更全面的汉字）
        this.charset = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz .,()-+%$#@!?' +
                      // 最常用3500汉字（覆盖99.9%日常使用）
                      '的一是在不了有和人这中大为上个国我以要他时来用们生到作地于出就分对成会可主发年动同工也能下过子说产种面而方后多定行学法所民得经十三之进着等部度家电力里如水化高自二理起小物现实加量都两体制机当使点从业本去把性好应开它合还因由其些然前外天政四日那社义事平形相全表间样与关各重新线内数正心反你明看原又么利比或但质气第向道命此变条只没结解问意建月公无系军很情者最立代想已通并提直题党程展五果料象员革位入常文总次品式活设及管特件长求老头基资边流路级少图山统接知较将组见计别她手角期根论运农指几九区强放决西被干做必战先回则任取据处队南给色光门即保治北造百规热领七海口东导器压志世金增争济阶油思术极交受联什认六共权收证改清己美再采转更单风切打白教速花带安场身车例真务具万每目至达走积示议声报斗完类八离华名确才科张信马节话米整空元况今集温传土许步群广石记需段研界拉林律叫且究观越织装影算低持音众书布复容儿须际商非验连断深难近矿千周委素技备半办青省列习响约支般史感劳便团往酸历市克何除消构府称太准精值号率族维划选标写存候毛亲快效斯院查江型眼王按格养易置派层片始却专状育厂京识适属圆包火住调满县局照参红细引听该铁价严龙城拿兵位乐万机字课斯院朝径杂灿伦票昨愿终纪汤春壤冬况环司令叔尺炎午控根整套企评职图片初层算据钟呢投宣云端版税庄鼓盖耕惊银森缺偏祝握苦疯猪智冷恋抱蟹牛磨擦娄绸粗兼痛眼砖窗绿陵杀妻厚亿茄渐赛婷旗瑞莲诸霍尔哭挑菜茂杨伐脸尖猫轰玛吸泪玉杰滑宿怕船虚恶寄塞恰拟酒毅丘兔寒慧醒砂聘祖哪伙腿蹲虫圣帽伴翻阳敬馅沸阔乌跟踪殊齐欲献撰砚辞铃钳畔旨亲睛莎舅朵兜狮廊驴豪帮辞典堤捧溶粟阔骆锌蔗迈椅灭腾夹纹碧洞袁颗豹盾曰扁吨琴喷慎虽栋罐瓦铸虾嚣杯陪伊憎颤铭萤斜扇沼垄亢俗稍遣俺烁蓝躲琅洁闽擅垂圆嵌脯仑姑侦蛇燃艰咨氢闺胡峡菊窟扩蹄媚耗淫秦牧绽顾绳尾坦肾逻厘逗猎渔崇缅睹枯墨雷潮胞撤瞪俊甘岛帝敞恃赏曰舆砌坯妖歇娜腰芽勘漠鹰唯蠢惩臭烽毕摧堪枯抵袍逐萄抑圈黄矛艳滩涧掌眯霞萝宽蛮隔宙篮炭疫阻栽峻奥烟弟渊滨孟岱茁傻顶犯闺屈蛮颇矣潭烫淌纠筹叮缩脱肪苹丧妹靴匀庆扑昙炯粒肃桃扼哑骑怨糠愈拾榔焦蜡辣狂矛硕楠墅毒坟寥闻绰琛捣炯壶喷圾拈囊巢袭宵虚虹歧畅扑俺朗昆萄燎婿侮祸隧疫拘炼嫂穆艘漫轨膊躺眺寅艺刑昭栋茵昌坡伏痕锈螺颈蹬幕谱赚揍咚韭腼伍羹郸懒虹偷汪茶窿琪虚瞧庞拒乏巧蜗穴瞄挡兮陶吵煤鞭寂燕滞涯卧虞讼蚪昧晋昧蜡烫弧饼栏榜梅涤崖滔褐薯剪菇跌匹糯豫愿瑚燃熄拗苑痴弘楷雹鬼秸驳翩侯瞻胳枢斥咬脊涂棺蒲踢箭锅聊渭耀糟鸭雀鲤蓟聪藕橱柏瞭碘醋胆荡秽厨泊翘韵禄掏玄倔嗽蛛禾滥哲绞蔑拐豁柑狭藏莫闷咽撒燥颂缔骚裹捻瞻伐镣殃撼劲霍羞咋腔盔酬闲纯堵豌肚曼娩匝晓磐阳睛揣禾蛋稼赊衍嚼弹凤崩卵蔚妓咒鄂纵苇憋眯饥窃圾拳挎巾泞陕靴赐兆踌惕舆猾嚎弥耳蓬靠泅垂泪';
        
        // 动态字符集（运行时添加的汉字）
        this.dynamicChars = new Set();
        this.dynamicCharMap = {};
        
        // 创建纹理画布
        this.fontAtlasCanvas = document.createElement('canvas');
        this.fontAtlasCtx = this.fontAtlasCanvas.getContext('2d');
        
        // 字符映射表
        this.charMap = {};
        
        // 计算字符尺寸（汉字需要更大空间）
        var fontSize = Math.floor(this.fontSize);
        var charWidth = Math.ceil(fontSize * 1.1);  // 汉字宽度
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
        
        console.log('字符图集尺寸:', this.fontAtlasCanvas.width + 'x' + this.fontAtlasCanvas.height, 
                   '支持字符数:', this.charset.length);
        
        // 设置字体样式
        this.fontAtlasCtx.font = fontSize + 'px Arial';
        this.fontAtlasCtx.fillStyle = this.textColor;
        this.fontAtlasCtx.textAlign = 'center';
        this.fontAtlasCtx.textBaseline = 'middle';
        
        // 预渲染所有字符
        this.charsPerRow = charsPerRow;
        this.currentRow = 0;
        
        for (var i = 0; i < this.charset.length; i++) {
            var char = this.charset[i];
            var col = i % charsPerRow;
            var row = Math.floor(i / charsPerRow);
            
            var x = col * charWidth + charWidth / 2;
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
        
        console.log('字符图集创建完成:', this.charset.length, '个预设字符，支持动态添加汉字');
        
        // 测试汉字查找
        this.testCharLookup();
    }
    
    // 测试字符查找功能
    testCharLookup() {
        var testChars = ['中', '国', '字', '符'];
        console.log('=== 字符查找测试 ===');
        
        for (var i = 0; i < testChars.length; i++) {
            var char = testChars[i];
            var charInfo = this.charMap[char];
            
            if (charInfo) {
                console.log('找到汉字 "' + char + '":', {
                    位置: '(' + charInfo.x + ', ' + charInfo.y + ')',
                    尺寸: charInfo.width + 'x' + charInfo.height
                });
            } else {
                console.log('未找到汉字 "' + char + '", 将动态添加');
            }
        }
    }
    
    // 动态添加汉字到图集
    addCharToAtlas(char) {
        if (this.charMap[char] || this.dynamicChars.has(char)) {
            return; // 字符已存在
        }
        
        // 计算新字符位置
        var x = this.dynamicCurrentCol * this.charWidth + this.charWidth / 2;
        var y = this.dynamicCurrentRow * this.charHeight + this.charHeight / 2;
        
        // 渲染新字符到图集
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
        
        console.log('动态添加汉字:', char, '总计:', this.dynamicChars.size, '个动态字符');
    }
    
    // 使用字符图集绘制文字（支持动态汉字）
    drawTextWithAtlas(ctx, text, centerX, centerY, color) {
        if (!text || !this.fontAtlasCanvas) return;
        
        var textStr = String(text);
        
        // 预处理：检查并添加缺失的汉字
        for (var i = 0; i < textStr.length; i++) {
            var char = textStr[i];
            if (!this.charMap[char]) {
                this.addCharToAtlas(char);
            }
        }
        
        // 计算总宽度
        var totalWidth = textStr.length * this.charWidth;
        var startX = centerX - totalWidth / 2;
        
        // 保存当前状态
        ctx.save();
        
        // 设置颜色（如果需要）
        if (color && color !== this.textColor) {
            ctx.globalCompositeOperation = 'source-atop';
            ctx.fillStyle = color;
        }
        
        // 逐字符贴图
        for (var i = 0; i < textStr.length; i++) {
            var char = textStr[i];
            var charInfo = this.charMap[char];
            
            if (charInfo) {
                var drawX = startX + i * this.charWidth;
                var drawY = centerY - this.charHeight / 2;
                
                // 从字符图集复制字符图像
                ctx.drawImage(
                    this.fontAtlasCanvas,           // 源图集
                    charInfo.x, charInfo.y,         // 源位置
                    charInfo.width, charInfo.height, // 源尺寸
                    drawX, drawY,                   // 目标位置
                    charInfo.width, charInfo.height // 目标尺寸
                );
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
        
        // 绘制编辑中的文字
        var textX = cellX + this.cellWidth / 2;
        var textY = cellY + this.cellHeight / 2;
        
        if (this.editingText) {
            this.drawTextWithAtlas(this.editCtx, this.editingText, textX, textY, this.textColor);
        }
        
        // 绘制光标
        if (this.cursorVisible) {
            this.drawCursor(cell, this.editingText, this.cursorPosition);
        }
        
        // 绘制编辑层到主画布
        this.ctx.drawImage(this.editCanvas, 0, 0);
    }
    
    // 绘制光标
    drawCursor(cell, text, cursorPos) {
        var cellX = this.offsetX + cell.col * this.cellWidth;
        var cellY = this.offsetY + this.headerHeight + cell.row * this.cellHeight;
        
        // 计算光标位置
        var textBeforeCursor = text.substring(0, cursorPos);
        var textWidth = textBeforeCursor.length * this.charWidth; // 简化计算
        
        var cursorX = cellX + this.cellWidth / 2 - (text.length * this.charWidth) / 2 + textWidth;
        var cursorY1 = cellY + this.cellHeight * 0.2;
        var cursorY2 = cellY + this.cellHeight * 0.8;
        
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
            self.cursorVisible = !self.cursorVisible;
            self.needsRedraw = true;
            self.draw();
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
        // 性能优化：只在需要时重绘
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
        
        // 4. 特效层（动画特效）
        this.drawEffects();
        
        this.needsRedraw = false;
    }
    
    // drawHeader已移到背景层
    
    // drawDataRows已移到背景层
    
    // drawBorders已移到背景层
    
    // 在指定位置触发扩散特效
    showEffectAt(x, y) {
        console.log('触发特效:', x, y); // 调试信息
        console.log('动画帧数据长度:', this.animationFrames ? this.animationFrames.length : 'undefined');
        
        this.effect.x = x;
        this.effect.y = y;
        this.effect.currentFrame = 0;
        this.effect.active = true;
        
        this.needsRedraw = true;
        this.animateEffect();
    }
    
    // 绘制特效
    drawEffects() {
        if (this.effect.active) {
            this.drawSingleEffect(this.effect);
        }
    }
    
    // 绘制单个特效（预渲染版本）
    drawSingleEffect(effect) {
        // 安全检查：防止数组越界
        if (!this.animationFrames || effect.currentFrame >= this.animationFrames.length) {
            return;
        }
        
        // 直接从预计算数据中获取当前帧
        var frameData = this.animationFrames[effect.currentFrame];
        
        this.ctx.save();
        this.ctx.globalAlpha = frameData.alpha;
        
        // 绘制外圈波纹
        this.ctx.strokeStyle = '#007bff';
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();
        this.ctx.arc(effect.x, effect.y, frameData.radius, 0, Math.PI * 2);
        this.ctx.stroke();
        
        // 绘制内圈波纹
        if (frameData.innerRadius > 0) {
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.arc(effect.x, effect.y, frameData.innerRadius, 0, Math.PI * 2);
            this.ctx.stroke();
        }
        
        // 绘制中心点
        this.ctx.fillStyle = '#007bff';
        this.ctx.beginPath();
        this.ctx.arc(effect.x, effect.y, 4, 0, Math.PI * 2);
        this.ctx.fill();
        
        this.ctx.restore();
    }
    
    // 动画特效（预渲染版本）
    animateEffect() {
        var self = this;
        
        if (!this.effect.active) return;
        
        // 直接播放下一帧，无需计算！
        this.effect.currentFrame++;
        
        if (this.effect.currentFrame < this.effect.totalFrames) {
            // 继续播放
            this.needsRedraw = true;
            this.draw();
            
            requestAnimationFrame(function() {
                self.animateEffect();
            });
        } else {
            // 动画结束
            this.effect.active = false;
            this.needsRedraw = true;
            this.draw();
        }
    }
    
    // 移除悬停单元格绘制以提升性能
    
    getCellFromCoords(x, y) {
        // 调整坐标以考虑偏移
        const adjustedX = x - this.offsetX;
        const adjustedY = y - this.offsetY;
        
        if (adjustedY < this.headerHeight || adjustedX < 0) return null;
        
        const col = Math.floor(adjustedX / this.cellWidth);
        const row = Math.floor((adjustedY - this.headerHeight) / this.cellHeight);
        
        if (col >= 0 && col < this.cols && row >= 0 && row < this.rows) {
            return { row, col };
        }
        
        return null;
    }
    
    addEventListeners() {
        var self = this;
        this.canvas.addEventListener('click', function(e) {
            var rect = self.canvas.getBoundingClientRect();
            var x = e.clientX - rect.left;
            var y = e.clientY - rect.top;
            
            var cell = self.getCellFromCoords(x, y);
            
            // 处理所有有效单元格的点击
            if (cell) {
                // 计算特效显示位置（单元格中心）
                var effectX = self.offsetX + cell.col * self.cellWidth + self.cellWidth / 2;
                var effectY = self.offsetY + self.headerHeight + cell.row * self.cellHeight + self.cellHeight / 2;
                
                // 显示特效
                self.showEffectAt(effectX, effectY);
                
                // 开始编辑单元格
                if (cell.col === 6) { // 第7列使用自定义日期控件
                    self.showCustomDatePicker(cell);
                    // 为日期列添加特殊的键盘监听
                    self.setupDateCellKeyListener(cell);
                } else {
                    self.startCellEdit(cell);
                }
            }
        });
        
        // 移除mousemove事件监听以提升性能
        
        // 添加键盘事件监听
        this.canvas.tabIndex = 1000; // 让Canvas可以获得焦点
        this.canvas.addEventListener('keydown', function(e) {
            self.handleKeyDown(e);
        });
        
        this.canvas.addEventListener('keypress', function(e) {
            self.handleKeyPress(e);
        });
        
        // 点击其他地方取消编辑
        document.addEventListener('click', function(e) {
            if (e.target !== self.canvas && self.editingCell && 
                !self.customDatePicker.contains(e.target)) {
                self.finishEdit();
            }
        });
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
        
        // 给Canvas焦点
        this.canvas.focus();
        
        // 开始光标闪烁
        this.startCursorBlink();
        
        this.needsRedraw = true;
        this.draw();
    }
    
    // 结束编辑
    finishEdit() {
        if (!this.editingCell) return;
        
        // 保存数据
        this.updateCellData(this.editingCell.row, this.editingCell.col, this.editingText);
        
        // 隐藏日期控件
        this.hideCustomDatePicker();
        
        // 清理编辑状态
        this.editingCell = null;
        this.editingText = '';
        this.cursorPosition = 0;
        this.stopCursorBlink();
        
        this.needsRedraw = true;
        this.draw();
    }
    
    // 显示日期选择器
    showDatePicker(cell, x, y) {
        this.finishEdit(); // 结束其他编辑
        this.editingCell = cell;
        
        var currentValue = this.data[cell.row] ? this.data[cell.row][cell.col] || '' : '';
        
        // 如果有现有值且是日期格式，设置为默认值
        if (currentValue && /^\d{4}-\d{2}-\d{2}$/.test(currentValue)) {
            this.datePicker.value = currentValue;
        } else {
            this.datePicker.value = '';
        }
        
        // 定位日期选择器
        var cellX = this.offsetX + cell.col * this.cellWidth + 5;
        var cellY = this.offsetY + this.headerHeight + cell.row * this.cellHeight + 5;
        
        this.datePicker.style.left = cellX + 'px';
        this.datePicker.style.top = cellY + 'px';
        this.datePicker.style.display = 'block';
        
        setTimeout(function() {
            this.datePicker.focus();
        }.bind(this), 10);
    }
    
    // 隐藏日期选择器
    hideDatePicker() {
        this.datePicker.style.display = 'none';
        this.editingCell = null;
    }
    
    // 处理键盘按下事件
    handleKeyDown(e) {
        if (!this.editingCell) return;
        
        switch(e.key) {
            case 'Enter':
                this.finishEdit();
                e.preventDefault();
                break;
            case 'Escape':
                this.cancelEdit();
                e.preventDefault();
                break;
            case 'Backspace':
                if (this.cursorPosition > 0) {
                    this.editingText = this.editingText.substring(0, this.cursorPosition - 1) + 
                                     this.editingText.substring(this.cursorPosition);
                    this.cursorPosition--;
                    this.needsRedraw = true;
                    this.draw();
                }
                e.preventDefault();
                break;
            case 'Delete':
                if (this.cursorPosition < this.editingText.length) {
                    this.editingText = this.editingText.substring(0, this.cursorPosition) + 
                                     this.editingText.substring(this.cursorPosition + 1);
                    this.needsRedraw = true;
                    this.draw();
                }
                e.preventDefault();
                break;
            case 'ArrowLeft':
                if (this.cursorPosition > 0) {
                    this.cursorPosition--;
                    this.needsRedraw = true;
                    this.draw();
                }
                e.preventDefault();
                break;
            case 'ArrowRight':
                if (this.cursorPosition < this.editingText.length) {
                    this.cursorPosition++;
                    this.needsRedraw = true;
                    this.draw();
                }
                e.preventDefault();
                break;
        }
    }
    
    // 处理键盘输入事件
    handleKeyPress(e) {
        if (!this.editingCell) return;
        
        // 过滤特殊键
        if (e.key.length > 1) return;
        
        // 插入字符
        this.editingText = this.editingText.substring(0, this.cursorPosition) + 
                          e.key + 
                          this.editingText.substring(this.cursorPosition);
        this.cursorPosition++;
        
        this.needsRedraw = true;
        this.draw();
        
        e.preventDefault();
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
            this.dataDrawn = false; // 只需重绘数据层
            this.needsRedraw = true;
            this.draw();
        }
    }
    
    // \u6027\u80fd\u4f18\u5316\u8f85\u52a9\u51fd\u6570
    cellsEqual(cell1, cell2) {
        if (!cell1 && !cell2) return true;
        if (!cell1 || !cell2) return false;
        return cell1.row === cell2.row && cell1.col === cell2.col;
    }
}

// 初始化表格
const table = new CanvasTable('tableCanvas');