// 表格配置文件
const TableConfig = {
    // 主题配置
    themes: {
        default: {
            borderColor: '#333',
            headerBgColor: '#4a90e2',
            headerTextColor: '#fff',
            cellBgColor: '#fff',
            altRowBgColor: '#f8f9fa',
            textColor: '#333',
            selectedColor: '#007bff',
            hoverColor: 'rgba(0, 123, 255, 0.1)'
        },
        dark: {
            borderColor: '#555',
            headerBgColor: '#2c3e50',
            headerTextColor: '#ecf0f1',
            cellBgColor: '#34495e',
            altRowBgColor: '#2c3e50',
            textColor: '#ecf0f1',
            selectedColor: '#3498db',
            hoverColor: 'rgba(52, 152, 219, 0.2)'
        },
        green: {
            borderColor: '#27ae60',
            headerBgColor: '#27ae60',
            headerTextColor: '#fff',
            cellBgColor: '#fff',
            altRowBgColor: '#d5f4e6',
            textColor: '#2c3e50',
            selectedColor: '#27ae60',
            hoverColor: 'rgba(39, 174, 96, 0.1)'
        }
    },
    
    // 数据集配置
    dataSets: {
        employees: {
            headers: ['ID', '姓名', '年龄', '职位', '部门'],
            data: [
                ['001', '张三', '28', '前端工程师', '技术部'],
                ['002', '李四', '32', '后端工程师', '技术部'],
                ['003', '王五', '26', '产品经理', '产品部'],
                ['004', '赵六', '30', '设计师', '设计部'],
                ['005', '钱七', '25', 'UI设计师', '设计部'],
                ['006', '孙八', '29', '测试工程师', '技术部']
            ]
        },
        products: {
            headers: ['产品ID', '产品名称', '价格', '库存', '分类'],
            data: [
                ['P001', 'iPhone 15', '¥7999', '50', '手机'],
                ['P002', 'MacBook Pro', '¥12999', '20', '电脑'],
                ['P003', 'iPad Air', '¥4599', '35', '平板'],
                ['P004', 'AirPods Pro', '¥1899', '100', '耳机'],
                ['P005', 'Apple Watch', '¥2999', '60', '手表']
            ]
        },
        sales: {
            headers: ['日期', '销售额', '订单数', '客户数', '转化率'],
            data: [
                ['2024-01-01', '¥125,000', '45', '38', '84.4%'],
                ['2024-01-02', '¥98,500', '32', '29', '90.6%'],
                ['2024-01-03', '¥156,200', '58', '52', '89.7%'],
                ['2024-01-04', '¥203,800', '71', '65', '91.5%'],
                ['2024-01-05', '¥187,300', '63', '58', '92.1%']
            ]
        }
    },
    
    // 尺寸配置
    sizes: {
        small: {
            cellWidth: 120,
            cellHeight: 35,
            headerHeight: 45,
            fontSize: 12
        },
        medium: {
            cellWidth: 150,
            cellHeight: 40,
            headerHeight: 50,
            fontSize: 14
        },
        large: {
            cellWidth: 180,
            cellHeight: 50,
            headerHeight: 60,
            fontSize: 16
        }
    }
};

// 工具函数
const TableUtils = {
    // 应用主题
    applyTheme(table, themeName) {
        const theme = TableConfig.themes[themeName];
        if (theme) {
            Object.assign(table, theme);
            table.draw();
        }
    },
    
    // 加载数据集
    loadDataSet(table, dataSetName) {
        const dataSet = TableConfig.dataSets[dataSetName];
        if (dataSet) {
            table.headers = [...dataSet.headers];
            table.data = dataSet.data.map(row => [...row]);
            table.rows = table.data.length;
            table.cols = table.headers.length;
            table.selectedCell = null;
            table.draw();
        }
    },
    
    // 应用尺寸
    applySize(table, sizeName) {
        const size = TableConfig.sizes[sizeName];
        if (size) {
            Object.assign(table, size);
            table.draw();
        }
    },
    
    // 导出表格数据为CSV
    exportToCSV(table) {
        const csvContent = [
            table.headers.join(','),
            ...table.data.map(row => row.join(','))
        ].join('\n');
        
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', 'table_data.csv');
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    },
    
    // 导出表格为图片
    exportToImage(table) {
        const link = document.createElement('a');
        link.download = 'table.png';
        link.href = table.canvas.toDataURL();
        link.click();
    }
};