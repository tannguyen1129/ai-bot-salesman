-- Seed BOD scripts for Securities outreach (TH) with welcome message
-- Source: docs/implementation/Sales script_Email_Chứng Khoán(TH).csv

INSERT INTO email_templates (industry, subject_template, body_template, status, version)
VALUES
  (
    'securities_ceo_followup_1',
    'Tăng cường an toàn hệ thống giao dịch & giảm thiểu rủi ro vận hành',
    E'Xin chào Anh/Chị {{recipient_name}},\n\nEm là Ngọc Y từ VNETWORK, cảm ơn Anh/Chị đã dành thời gian đọc email này.\n\nKính gửi Ban Lãnh Đạo Công Ty {{company_name}},\nEm là Ngọc Y, phụ trách tư vấn giải pháp bảo mật tại VNETWORK.\nVới hơn 12 năm kinh nghiệm, VNETWORK tiên phong trong Cloud Security, DDoS Protection, Firewall AI, CDN, SOC - giúp tăng cường an ninh thông tin, giảm thiểu rủi ro tấn công mạng.\n\nHôm nay, em xin phép gửi Anh/Chị một góc nhìn ngắn về an toàn hệ thống trong lĩnh vực chứng khoán.\nVới đặc thù hệ thống giao dịch trực tuyến, các rủi ro như gián đoạn dịch vụ (DDoS), tấn công vào ứng dụng, rò rỉ dữ liệu hay giả mạo email đang ngày càng phổ biến và có thể ảnh hưởng trực tiếp đến uy tín, doanh thu và trải nghiệm khách hàng.\n\nVNETWORK hiện đang triển khai các nhóm giải pháp giúp kiểm soát toàn diện các rủi ro này:\n- Bảo vệ hệ thống giao dịch web/app/API trước tấn công và gián đoạn\n- Ngăn chặn giả mạo email, phishing và rủi ro từ người dùng nội bộ\n- Giám sát an ninh 24/7, phát hiện sớm và xử lý sự cố nhanh chóng\n- Kiểm soát tài khoản đặc quyền, hạn chế rủi ro nội bộ\n- Đánh giá bảo mật định kỳ để phát hiện lỗ hổng trước khi bị khai thác\n\nCác giải pháp này giúp:\n- Đảm bảo hệ thống giao dịch vận hành ổn định\n- Giảm thiểu rủi ro tài chính và pháp lý\n- Nâng cao mức độ tin cậy với khách hàng và đối tác\n\nNếu Anh/Chị quan tâm, em rất mong có cơ hội trao đổi ngắn (15-20 phút) để hiểu thêm về hiện trạng và chia sẻ cách các đơn vị cùng ngành đang triển khai.\n\nTrân trọng,\n{{sender_name}}\n{{sender_company}}',
    'active',
    1
  ),
  (
    'securities_ceo_followup_2',
    '[Follow up] Tăng cường bảo mật và duy trì ổn định hệ thống giao dịch',
    E'Xin chào Anh/Chị {{recipient_name}},\n\nEm là Ngọc Y từ VNETWORK, em xin phép follow-up vì đây là chủ đề liên quan trực tiếp đến vận hành hệ thống của bên mình.\n\nKính gửi Ban Lãnh Đạo Công Ty {{company_name}},\n\nEm xin phép follow-up lại email trước vì đây là một điểm em nghĩ có thể liên quan trực tiếp đến vận hành hệ thống của bên mình.\n\nThực tế gần đây, các sự cố trong ngành tài chính không còn dừng ở việc bị tấn công, mà nằm ở:\n- Gián đoạn hệ thống giao dịch vào thời điểm cao điểm\n- Email giả mạo nội bộ gây sai lệch thông tin hoặc giao dịch\n- Lỗ hổng tồn tại nhưng không được phát hiện sớm\n\nĐiểm chung là đa số đều xuất phát từ việc thiếu một lớp kiểm soát tổng thể và phản ứng kịp thời.\n\nBên em đang làm việc với một số đơn vị trong ngành để:\n- Giữ hệ thống luôn hoạt động ổn định ngay cả khi bị tấn công\n- Phát hiện và xử lý sự cố trong thời gian thực\n- Giảm thiểu rủi ro trước khi ảnh hưởng đến khách hàng và doanh thu\n\nEm tin rằng chỉ với 15-30 phút trao đổi, Anh/Chị sẽ có thêm góc nhìn thực tế để đánh giá và tối ưu hiện trạng an toàn hệ thống.\n\nNếu thuận tiện, em xin phép đề xuất một buổi trao đổi ngắn theo lịch phù hợp của Anh/Chị. Em sẵn sàng linh hoạt theo thời gian Anh/Chị sắp xếp.\n\nTrân trọng,\n{{sender_name}}\n{{sender_company}}',
    'active',
    1
  ),
  (
    'securities_ceo_followup_3',
    'Đáp ứng ANTT cấp độ 3 & đảm bảo vận hành hệ thống giao dịch ổn định',
    E'Xin chào Anh/Chị {{recipient_name}},\n\nEm là Ngọc Y từ VNETWORK, gửi Anh/Chị thêm một góc nhìn tổng hợp để tiện tham khảo nội bộ.\n\nKính gửi Ban Lãnh Đạo Công Ty {{company_name}},\n\nTrong bối cảnh các yêu cầu về An toàn thông tin (ANTT cấp độ 3) ngày càng chặt chẽ, việc đảm bảo hệ thống giao dịch vận hành ổn định và kiểm soát rủi ro an ninh đang trở thành ưu tiên hàng đầu đối với các công ty chứng khoán.\n\nTừ thực tế triển khai, các doanh nghiệp trong ngành thường tập trung vào 3 lớp kiểm soát chính:\n\n1. Bảo vệ hệ thống và dịch vụ giao dịch\nNgăn chặn tấn công vào web/app/API, hạn chế gián đoạn dịch vụ và đảm bảo hệ thống luôn sẵn sàng phục vụ khách hàng.\n\n2. Giám sát và phản ứng sự cố theo thời gian thực\nThu thập và phân tích dữ liệu toàn hệ thống, phát hiện sớm các dấu hiệu bất thường và tự động hóa quy trình xử lý để giảm thiểu thời gian ảnh hưởng.\n\n3. Kiểm soát truy cập và rủi ro nội bộ\nQuản lý chặt chẽ tài khoản đặc quyền, ghi nhận đầy đủ hoạt động và giảm thiểu nguy cơ phát sinh từ bên trong.\n\nCác lớp kiểm soát này được triển khai thông qua các nền tảng như WAAP, SIEM, SOAR, SOC và PAM, giúp:\n- Đáp ứng yêu cầu ANTT cấp độ 3 theo quy định\n- Giảm thiểu nguy cơ gián đoạn hệ thống giao dịch\n- Hạn chế rủi ro tài chính và ảnh hưởng đến uy tín doanh nghiệp\n- Tăng khả năng phát hiện và xử lý sự cố trong thời gian thực\n\nHiện VNETWORK đang triển khai mô hình này cho một số doanh nghiệp trong lĩnh vực tài chính tại Việt Nam như: HSC, Vietcap, ACBS, Yuanta, Fireant, Funan, VTGS, BMSC, VPS, BVSC...\n\nNếu Anh/Chị quan tâm, em xin phép trao đổi ngắn để chia sẻ cách các đơn vị cùng ngành đang triển khai thực tế.\n\nTrân trọng,\n{{sender_name}}\n{{sender_company}}',
    'active',
    1
  ),
  (
    'securities_cto_followup_1',
    'Đề xuất giải pháp WAAP - SIEM - SOAR - SOC - PAM đáp ứng ANTT cấp độ 3 cho hệ thống Chứng khoán',
    E'Xin chào Anh/Chị {{recipient_name}},\n\nEm là Ngọc Y từ VNETWORK, cảm ơn Anh/Chị đã dành thời gian đọc email này.\n\nKính gửi Anh/Chị,\nEm là Ngọc Y, phụ trách tư vấn giải pháp bảo mật tại VNETWORK.\nVới hơn 12 năm kinh nghiệm, VNETWORK tiên phong trong Cloud Security, DDoS Protection, Firewall AI, CDN, SOC - giúp tăng cường an ninh thông tin, giảm thiểu rủi ro tấn công mạng.\n\nTrong quá trình làm việc với các tổ chức tài chính - chứng khoán, bên em nhận thấy 3 nhóm rủi ro phổ biến nhưng thường chưa được kiểm soát triệt để:\n- Tấn công vào Web/App/API (OWASP Top 10, DDoS layer 7)\n- Thiếu khả năng phát hiện & phản ứng sớm khi có sự cố (log rời rạc, không correlation)\n- Rủi ro từ tài khoản đặc quyền (admin, DB, hệ thống core trading)\n\nĐể đáp ứng đầy đủ yêu cầu An toàn thông tin cấp độ 3, bên em đề xuất mô hình tích hợp gồm:\n1. WAAP\n2. SIEM\n3. SOAR\n4. SOC\n5. PAM\n\nGiá trị mang lại:\n- Đáp ứng các nhóm kiểm soát của ANTT cấp độ 3\n- Tăng khả năng phát hiện sớm và giảm thiểu thiệt hại khi có sự cố\n- Chuẩn hóa vận hành an toàn thông tin theo mô hình enterprise\n\nNếu thuận tiện, bên em có thể chia sẻ chi tiết kiến trúc triển khai phù hợp với hệ thống hiện tại của Anh/Chị.\n\nTrân trọng,\n{{sender_name}}\n{{sender_company}}',
    'active',
    1
  ),
  (
    'securities_cto_followup_2',
    'Follow-up: Trao đổi thêm về kiến trúc bảo mật tổng thể',
    E'Xin chào Anh/Chị {{recipient_name}},\n\nEm là Ngọc Y từ VNETWORK, em xin phép follow-up thêm để mình có thể đi sâu hơn vào góc kỹ thuật.\n\nKính gửi Anh/Chị,\n\nEm xin phép follow-up lại sau trao đổi trước về giải pháp bảo mật cho hệ thống web/app/api bên mình.\n\nBên em tập trung vào triển khai thực tế theo hướng bảo vệ tổng thể, đặc biệt với các hệ thống có yêu cầu cao như chứng khoán và nền tảng online.\n\nNgoài lớp bảo vệ web/app/api, bên em còn xây dựng hệ sinh thái bảo mật gồm:\n- Bảo mật email: ngăn chặn phishing, giả mạo và tấn công qua email\n- SIEM & SOAR: thu thập, phân tích log và tự động hóa phản ứng sự cố\n- SOC: giám sát và xử lý sự kiện an ninh 24/7\n- PAM: kiểm soát và quản lý tài khoản đặc quyền\n\nThế mạnh của VNETWORK là hạ tầng tối ưu cho thị trường Việt Nam, giúp xử lý lưu lượng nội địa hiệu quả, giảm độ trễ và phù hợp bối cảnh tấn công thực tế.\n\nNếu Anh/Chị sắp xếp được 20-30 phút, bên em rất sẵn sàng cùng rà nhanh kiến trúc hiện tại và đề xuất hướng tối ưu.\n\nTrân trọng,\n{{sender_name}}\n{{sender_company}}',
    'active',
    1
  ),
  (
    'securities_cto_followup_3',
    'Follow-up: Kiểm tra lại nhu cầu trao đổi về bảo mật hệ thống',
    E'Xin chào Anh/Chị {{recipient_name}},\n\nEm là Ngọc Y từ VNETWORK, em follow-up lần cuối để Anh/Chị tiện cập nhật trạng thái ưu tiên hiện tại.\n\nKính gửi Anh/Chị,\n\nEm xin phép follow-up lại email trước do chưa nhận được phản hồi từ Anh/Chị.\n\nKhông rõ hiện tại bên mình đã có kế hoạch cụ thể cho việc nâng cấp hoặc rà soát hệ thống bảo mật trong thời gian tới chưa. Trong quá trình làm việc với các khách hàng cùng lĩnh vực, bên em nhận thấy một số rủi ro phổ biến liên quan đến DDoS, bảo mật ứng dụng và kiểm soát truy cập nội bộ.\n\nBên em hiện đang cung cấp giải pháp bảo mật tổng thể bao gồm:\n- Bảo vệ web/app/api (WAF, Anti-DDoS)\n- Bảo mật email (chống phishing, giả mạo)\n- SIEM & SOAR (giám sát và tự động phản ứng sự cố)\n- SOC 24/7 (theo dõi và xử lý sự kiện an ninh)\n- PAM (quản lý tài khoản đặc quyền)\n\nCác giải pháp đã được triển khai thực tế tại một số khách hàng chứng khoán như HSC, VPS, Yuanta, ACBS, Vietcap... với yêu cầu cao về hiệu năng và độ ổn định.\n\nTrong trường hợp Anh/Chị vẫn đang cân nhắc hoặc chưa ưu tiên ở thời điểm này, em rất mong nhận được phản hồi ngắn để bên em chủ động sắp xếp hỗ trợ phù hợp.\n\nTrân trọng,\n{{sender_name}}\n{{sender_company}}',
    'active',
    1
  )
ON CONFLICT (industry, version) DO UPDATE
SET
  subject_template = EXCLUDED.subject_template,
  body_template = EXCLUDED.body_template,
  status = EXCLUDED.status,
  updated_at = now();
