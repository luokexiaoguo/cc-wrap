// Code Review 9 阶段系统（借鉴 Claude Code 架构）

// 三态验证结果
const VerificationState = {
  CONFIRMED: 'confirmed',   // 确认是问题
  PLAUSIBLE: 'plausible',   // 可能是问题
  REFUTED: 'refuted',       // 误报
};

// Review 阶段
const ReviewStage = {
  DIFF_SCAN: 1,           // 逐行 diff 扫描
  LOW_EFFORT: 2,          // 低 effort 模式
  HIGH_EFFORT: 3,         // 高 effort 模式
  THREE_STATE: 4,         // 三态验证
  RECALL_BIASED: 5,       // 反漏看验证
  MEDIUM_EFFORT: 6,       // 中 effort 模式
  HIGH_EFFORT_2: 7,       // 高 effort 模式（第二轮）
  GITHUB_COMMENT: 8,      // GitHub 评论
  FIX_APPLICATION: 9,     // 应用修复
};

class CodeReviewer {
  constructor() {
    this.findings = [];
    this.verifiedFindings = [];
  }

  /**
   * Stage 1: 逐行 diff 扫描
   */
  async scanDiff(diffContent) {
    const findings = [];

    // 解析 diff
    const lines = diffContent.split('\n');
    let currentFile = '';
    let currentLine = 0;

    for (const line of lines) {
      // 解析文件名
      if (line.startsWith('--- a/') || line.startsWith('+++ b/')) {
        currentFile = line.replace(/^[+-]{3} [ab]\//, '');
        continue;
      }

      // 解析行号
      const lineMatch = line.match(/^@@ -(\d+),?\d* \+(\d+),?\d* @@/);
      if (lineMatch) {
        currentLine = parseInt(lineMatch[2]);
        continue;
      }

      // 跳过上下文行
      if (line.startsWith(' ')) {
        currentLine++;
        continue;
      }

      // 分析变更行
      if (line.startsWith('+') || line.startsWith('-')) {
        const finding = this.analyzeLine(line, currentFile, currentLine);
        if (finding) {
          findings.push(finding);
        }
        if (line.startsWith('+')) {
          currentLine++;
        }
      }
    }

    this.findings = findings;
    return findings;
  }

  /**
   * 分析单行代码
   */
  analyzeLine(line, file, lineNumber) {
    const content = line.substring(1); // 移除 +/- 前缀

    // 检查常见问题模式
    const issues = [
      { pattern: /eval\s*\(/, severity: 'high', type: 'security', desc: '使用 eval() 可能导致代码注入' },
      { pattern: /innerHTML\s*=/, severity: 'medium', type: 'security', desc: '使用 innerHTML 可能导致 XSS' },
      { pattern: /console\.(log|debug|info)\s*\(/, severity: 'low', type: 'quality', desc: '调试日志残留' },
      { pattern: /TODO|FIXME|HACK|XXX/, severity: 'low', type: 'quality', desc: '待处理标记' },
      { pattern: /catch\s*\(\s*\w*\s*\)\s*\{\s*\}/, severity: 'medium', type: 'quality', desc: '空 catch 块' },
      { pattern: /password|secret|api[_-]?key/i, severity: 'medium', type: 'security', desc: '可能泄露敏感信息' },
    ];

    for (const issue of issues) {
      if (issue.pattern.test(content)) {
        return {
          file,
          lineNumber,
          content: content.trim(),
          severity: issue.severity,
          type: issue.type,
          description: issue.desc,
          state: VerificationState.PLAUSIBLE, // 默认 PLAUSIBLE
        };
      }
    }

    return null;
  }

  /**
   * Stage 4: 三态验证
   */
  async verifyThreeState(finding) {
    // 这里应该调用 LLM 进行验证
    // 简化实现：保持 PLAUSIBLE 状态
    return {
      ...finding,
      verificationState: VerificationState.PLAUSIBLE,
      verificationNotes: '需要人工确认',
    };
  }

  /**
   * Stage 5: 反漏看验证
   */
  async recallBiasVerification(findings) {
    // 确保没有遗漏重要问题
    const verified = [];

    for (const finding of findings) {
      const verifiedFinding = await this.verifyThreeState(finding);
      verified.push(verifiedFinding);
    }

    this.verifiedFindings = verified;
    return verified;
  }

  /**
   * 获取统计信息
   */
  getStats() {
    const confirmed = this.verifiedFindings.filter(f => f.verificationState === VerificationState.CONFIRMED).length;
    const plausible = this.verifiedFindings.filter(f => f.verificationState === VerificationState.PLAUSIBLE).length;
    const refuted = this.verifiedFindings.filter(f => f.verificationState === VerificationState.REFUTED).length;

    return {
      total: this.verifiedFindings.length,
      confirmed,
      plausible,
      refuted,
    };
  }

  /**
   * 格式化报告
   */
  formatReport() {
    const stats = this.getStats();
    const lines = [
      '## Code Review 报告',
      '',
      `### 统计`,
      `- 总计: ${stats.total} 个问题`,
      `- 确认: ${stats.confirmed} 个`,
      `- 待确认: ${stats.plausible} 个`,
      `- 误报: ${stats.refuted} 个`,
      '',
      '### 详细列表',
    ];

    for (const finding of this.verifiedFindings) {
      const icon = finding.verificationState === VerificationState.CONFIRMED ? '🔴' :
                   finding.verificationState === VerificationState.PLAUSIBLE ? '🟡' : '🟢';
      lines.push(`${icon} **${finding.file}:${finding.lineNumber}** - ${finding.description}`);
      lines.push(`   代码: \`${finding.content}\``);
      lines.push(`   状态: ${finding.verificationState}`);
      lines.push('');
    }

    return lines.join('\n');
  }
}

module.exports = {
  CodeReviewer,
  VerificationState,
  ReviewStage,
};
