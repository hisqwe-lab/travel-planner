# 여행 일정 앱 배포와 공동 편집 설정

## 1. Google Maps

앱 상단의 `Google Maps API 키` 칸에는 Maps JavaScript API가 활성화된 키를 넣습니다.

배포된 앱에서 모든 사용자가 키를 따로 입력하지 않게 하려면 `config.js` 파일의 값을 바꿉니다.

```js
window.TRAVEL_PLANNER_GOOGLE_MAPS_KEY = "여기에_Google_Maps_API_키";
```

API 키를 제한할 때 앱을 배포한 주소를 리퍼러로 추가하세요.

예:

```text
https://내앱주소.netlify.app/*
http://localhost:8000/*
http://127.0.0.1:8000/*
```

## 2. Firebase Realtime Database

Firebase 콘솔에서 프로젝트를 만들고 Realtime Database를 생성합니다.

앱의 `Firebase DB 주소`에는 Realtime Database URL을 넣습니다.

예:

```text
https://my-trip-app-default-rtdb.firebaseio.com
```

`여행 코드`는 두 사람만 아는 긴 코드로 만드세요. 앱의 `코드 생성` 버튼을 쓰면 됩니다.

## 3. Firebase 규칙

처음 테스트할 때만 아래처럼 열어둘 수 있습니다.

```json
{
  "rules": {
    "trips": {
      "$tripCode": {
        ".read": true,
        ".write": true
      }
    }
  }
}
```

이 규칙은 여행 코드를 아는 사람이 읽고 쓸 수 있는 방식입니다. 완전한 로그인 보안은 아니므로, 중요한 개인정보나 결제정보는 넣지 마세요.

## 4. 공유 순서

1. 앱을 Netlify, Vercel, GitHub Pages 등에 업로드합니다.
2. 배포된 웹주소로 앱을 엽니다.
3. Google Maps API 키를 저장합니다.
4. Firebase DB 주소와 여행 코드를 입력합니다.
5. `공동 편집 연결`을 누릅니다.
6. `공유 링크`를 눌러 배우자에게 보냅니다.

상대방도 같은 링크로 접속하면 같은 여행 코드의 데이터를 함께 수정합니다.
