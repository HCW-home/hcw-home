import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
@Injectable({
  providedIn: 'root'
})
export class ConfigService {

  constructor(private http: HttpClient) {}


  getCountries(): Observable<{ code: string; name: string }[]> {
    return this.http.get<{ code: string; name: string }[]>('assets/json/country.json');
  }

}
