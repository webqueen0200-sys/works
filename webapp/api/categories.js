const { withApi } = require("./_cors");
const { getJSON, setJSON } = require("./_kv");

const DEFAULT_CATEGORIES = {
  majors: ["기업", "소상공인", "GA", "공통", "SI"],
  minors: {
    "기업": ["상품서비스", "요금제/패키지", "메인", "비즈인사이트", "이벤트", "마이페이지", "고객지원", "혜택", "개선", "빌보드/팝업", "콘텐츠", "가입신청", "개인화", "개발지원", "공통", "외부채널", "웹접근성", "기타"],
    "소상공인": ["상품서비스", "요금제/패키지", "메인", "소상공인 인사이트", "이벤트", "마이페이지", "고객지원", "혜택", "개선", "빌보드/팝업", "콘텐츠", "가입신청", "개인화", "개발지원", "공통", "외부채널", "웹접근성", "기타"],
    "GA": ["GA_기업", "GA_소상", "GA_공통"],
    "공통": ["업무지원", "업무관리", "회의", "기타"],
    "SI": ["기타"]
  }
};

module.exports = withApi(async (req, res) => {
  if (req.method === "GET") {
    const categories = await getJSON("categories", DEFAULT_CATEGORIES);
    return res.status(200).json({ categories });
  }

  if (req.method === "PUT") {
    const { categories } = req.body || {};
    if (!categories || !Array.isArray(categories.majors)) {
      return res.status(400).json({ error: "categories.majors 배열이 필요합니다." });
    }
    await setJSON("categories", categories);
    return res.status(200).json({ categories });
  }

  return res.status(405).json({ error: "지원하지 않는 메서드입니다." });
});
