const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ 
    headless: false,
    slowMo: 300,
    timeout: 120000
  });
  
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  
  const page = await context.newPage();
  
  // 네비게이션 타임아웃 증가
  page.setDefaultTimeout(120000);
  page.setDefaultNavigationTimeout(120000);
  
  try {
    console.log('1. http://localhost:3000 으로 이동...');
    
    // 페이지 로딩을 기다리지 않고 바로 진행
    page.goto('http://localhost:3000').catch(e => console.log('로딩 중...'));
    
    // 페이지가 어느 정도 로드될 때까지 기다림
    await page.waitForTimeout(10000);
    console.log('   ✓ 페이지 접속 시도 완료');
    
    console.log('2. "PDF 일괄 풀이" 탭 클릭...');
    await page.locator('button:has-text("PDF 일괄 풀이")').click({ timeout: 10000, force: true }).catch(e => console.log('클릭 시도...'));
    await page.waitForTimeout(2000);
    
    console.log('3. PDF 파일 업로드...');
    const pdfPath = String.raw`C:\Users\7t7st\Downloads\고쟁이 미적분 문제-36-38.pdf`;
    
    const fileInput = await page.locator('input[type="file"]');
    await fileInput.setInputFiles(pdfPath);
    console.log('   ✓ 파일 선택됨, 업로드 처리 대기...');
    
    await page.waitForTimeout(5000);
    
    console.log('4. PDF 페이지 렌더링 대기 (페이지 썸네일)...');
    
    // canvas나 이미지 요소가 나타날 때까지 대기
    try {
      await page.waitForSelector('canvas, img', { timeout: 60000 });
      console.log('   ✓ PDF 렌더링 요소 발견');
    } catch (e) {
      console.log('   ⚠ 특정 요소를 찾지 못했지만 계속 진행...');
    }
    
    await page.waitForTimeout(5000);
    
    console.log('5. 페이지 썸네일 스크린샷 촬영...');
    await page.screenshot({ 
      path: 'screenshot-1-thumbnails.png',
      fullPage: true 
    });
    console.log('   ✓ screenshot-1-thumbnails.png 저장됨');
    
    console.log('6. "전체 문제 3단계 해설 생성하기" 버튼 클릭...');
    const generateButton = await page.locator('button:has-text("전체 문제 3단계 해설 생성하기")');
    await generateButton.click();
    
    console.log('7. "문제 목록 분석 중..." 단계 대기...');
    await page.waitForSelector('text=문제 목록 분석 중', { timeout: 5000 });
    console.log('   ✓ 분석 시작됨');
    
    await page.waitForSelector('text=문제 목록 분석 중', { 
      state: 'detached',
      timeout: 60000 
    });
    console.log('   ✓ 분석 완료됨');
    
    await page.waitForTimeout(2000);
    
    console.log('8. 문제 카드 출현 확인 및 스크린샷...');
    const problemCards = await page.locator('[class*="border"][class*="rounded"]').count();
    console.log(`   ✓ ${problemCards}개의 문제 카드 발견`);
    
    await page.screenshot({ 
      path: 'screenshot-2-problems-identified.png',
      fullPage: true 
    });
    console.log('   ✓ screenshot-2-problems-identified.png 저장됨');
    
    console.log('9. 2-3개 문제의 해설 완료 대기...');
    let completedCount = 0;
    let waitTime = 0;
    const maxWaitTime = 300000; // 5분
    
    while (completedCount < 2 && waitTime < maxWaitTime) {
      await page.waitForTimeout(5000);
      waitTime += 5000;
      
      const sections = await page.locator('h3:has-text("1단계"), h3:has-text("2단계"), h3:has-text("3단계")').count();
      completedCount = Math.floor(sections / 3);
      
      if (completedCount > 0) {
        console.log(`   ✓ 현재 ${completedCount}개 문제 해설 완료됨 (${waitTime/1000}초 경과)`);
      }
      
      if (completedCount >= 2) {
        console.log('   ✓ 2개 이상 완료! 대기 종료');
        break;
      }
    }
    
    if (completedCount < 2) {
      console.log(`   ⚠ 시간 초과 또는 완료된 문제가 부족함 (${completedCount}개만 완료)`);
    }
    
    await page.waitForTimeout(2000);
    
    console.log('10. 최종 결과 스크린샷...');
    await page.screenshot({ 
      path: 'screenshot-3-solutions-completed.png',
      fullPage: true 
    });
    console.log('   ✓ screenshot-3-solutions-completed.png 저장됨');
    
    console.log('\n=== 테스트 결과 요약 ===');
    
    const allProblems = await page.locator('text=문제').count();
    console.log(`- 식별된 문제 수: 약 ${allProblems}개`);
    
    const completedSections = await page.locator('h3:has-text("1단계"), h3:has-text("2단계"), h3:has-text("3단계")').count();
    const completedProblems = Math.floor(completedSections / 3);
    console.log(`- 완료된 문제 수: ${completedProblems}개`);
    
    const errors = await page.locator('text=오류, text=에러, text=Error').count();
    if (errors > 0) {
      console.log(`- 발견된 오류: ${errors}개`);
      const errorTexts = await page.locator('text=오류, text=에러, text=Error').allTextContents();
      console.log('  오류 내용:', errorTexts);
    } else {
      console.log('- 발견된 오류: 없음');
    }
    
    console.log('\n해설이 올바른지 확인:');
    const solutionTexts = await page.locator('[class*="prose"]').first().textContent();
    if (solutionTexts && solutionTexts.length > 100) {
      console.log('- 해설이 정상적으로 생성된 것으로 보임');
      console.log(`- 첫 번째 해설 미리보기: ${solutionTexts.substring(0, 200)}...`);
    } else {
      console.log('- 해설 내용이 부족하거나 없음');
    }
    
    console.log('\n✓ 테스트 완료! 스크린샷 파일들을 확인하세요.');
    
  } catch (error) {
    console.error('\n❌ 오류 발생:', error.message);
    await page.screenshot({ 
      path: 'screenshot-error.png',
      fullPage: true 
    });
    console.log('오류 발생 시점의 스크린샷: screenshot-error.png');
  } finally {
    await page.waitForTimeout(5000);
    await browser.close();
  }
})();
